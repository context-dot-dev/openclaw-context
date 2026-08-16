import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { readProviderJsonObjectResponse } from "openclaw/plugin-sdk/provider-http";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  markdownToText,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  withTrustedWebToolsEndpoint,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-fetch";
import { postTrustedWebToolsJson, resolveSiteName } from "openclaw/plugin-sdk/provider-web-search";
import {
  truncateSanitizedExternalContent,
  wrapExternalContent,
  wrapWebContent,
} from "openclaw/plugin-sdk/security-runtime";
import { SsrFBlockedError, isBlockedHostnameOrIp } from "openclaw/plugin-sdk/ssrf-runtime";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import {
  resolveContextApiKey,
  resolveContextScrapeTimeoutSeconds,
  resolveContextSearchTimeoutSeconds,
} from "./config.js";

const CONTEXT_SEARCH_URL = "https://api.context.dev/v1/web/search";
const CONTEXT_SCRAPE_URL = "https://api.context.dev/v1/web/scrape/markdown";
const DEFAULT_SEARCH_COUNT = 5;
const DEFAULT_SCRAPE_MAX_CHARS = 50_000;
const CONTEXT_SEARCH_MAX_RESULTS = 100;
const CONTEXT_SEARCH_MIN_REQUEST_RESULTS = 10;
const CONTEXT_SEARCH_MAX_CONTENT_CHARS = 20_000;
const CONTEXT_SEARCH_METADATA_MAX_CHARS = 128;
const CONTEXT_SCRAPE_METADATA_MAX_CHARS = 4_000;
const CONTEXT_SCRAPE_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const CONTEXT_SEARCH_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const CONTEXT_RESULT_URL_MAX_CHARS = 2_048;
const CONTEXT_DOMAIN_FILTER_MAX_ITEMS = 100;
const CONTEXT_TIMEOUT_MAX_SECONDS = 300;
const COUNTRY_CODE_RE = /^[a-z]{2}$/u;
const SEARCH_METADATA_TOKEN_RE = /^[a-z0-9_:-]+$/iu;

const SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();
const SCRAPE_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();

export type ContextFreshness = "last_24_hours" | "last_week" | "last_month" | "last_year";

export type ContextSearchParams = {
  cfg?: OpenClawConfig;
  query: string;
  count?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  freshness?: ContextFreshness;
  country?: string;
  queryFanout?: boolean;
  scrapeResults?: boolean;
  useMainContentOnly?: boolean;
  timeoutSeconds?: number;
  signal?: AbortSignal;
};

export type ContextScrapeParams = {
  cfg?: OpenClawConfig;
  url: string;
  extractMode: "markdown" | "text";
  maxChars?: number;
  includeLinks?: boolean;
  includeImages?: boolean;
  useMainContentOnly?: boolean;
  includeFrames?: boolean;
  maxAgeMs?: number;
  waitForMs?: number;
  settleAnimations?: boolean;
  country?: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
};

function normalizeContextResultUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > CONTEXT_RESULT_URL_MAX_CHARS) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.href.length > CONTEXT_RESULT_URL_MAX_CHARS
    ) {
      return undefined;
    }
    return url.href === `${value}/` ? value : url.href;
  } catch {
    return undefined;
  }
}

function normalizeDomainFilters(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    CONTEXT_DOMAIN_FILTER_MAX_ITEMS,
  );
}

function normalizeCountry(value: string | undefined): string | undefined {
  const country = value?.trim().toLowerCase();
  if (!country) {
    return undefined;
  }
  if (!COUNTRY_CODE_RE.test(country)) {
    throw new Error("Context country must be a two-letter ISO country code.");
  }
  return country;
}

function resolveTimeoutSeconds(value: number | undefined, fallback: number): number {
  const resolved =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(CONTEXT_TIMEOUT_MAX_SECONDS, resolved));
}

function requireContextApiKey(
  cfg: OpenClawConfig | undefined,
  preferred: "webSearch" | "webFetch",
  toolName: string,
): string {
  const apiKey = resolveContextApiKey(cfg, preferred);
  if (apiKey) {
    return apiKey;
  }
  throw new Error(
    `${toolName} needs a Context.dev API key. Set CONTEXT_API_KEY in the Gateway environment, or configure plugins.entries.context.config.${preferred}.apiKey.`,
  );
}

function assertContextScrapeTargetAllowed(url: string): void {
  if (url.length > CONTEXT_RESULT_URL_MAX_CHARS) {
    throw new SsrFBlockedError("Context.dev scrape URL exceeds 2048 characters");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrFBlockedError("Invalid URL supplied to Context.dev scrape");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrFBlockedError(
      `Blocked non-HTTP(S) protocol in Context.dev scrape URL: ${parsed.protocol}`,
    );
  }
  if (isBlockedHostnameOrIp(parsed.hostname)) {
    throw new SsrFBlockedError(
      `Blocked hostname or private/internal IP in Context.dev scrape URL: ${parsed.hostname}`,
    );
  }
}

async function readContextJsonResponse(
  response: Response,
  label: string,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  return await readProviderJsonObjectResponse(response, label, { maxBytes });
}

async function getContextJson(params: {
  url: string;
  timeoutSeconds: number;
  apiKey: string;
  errorLabel: string;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  return await withTrustedWebToolsEndpoint(
    {
      url: params.url,
      timeoutSeconds: params.timeoutSeconds,
      ...(params.signal ? { signal: params.signal } : {}),
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${params.apiKey}`,
          "X-Client-Source": "openclaw",
        },
      },
    },
    async ({ response }) => {
      if (!response.ok) {
        const detail = await readResponseText(response, { maxBytes: 64_000 });
        const safeDetail = truncateSanitizedExternalContent(
          detail.text || response.statusText,
          CONTEXT_SCRAPE_METADATA_MAX_CHARS,
        ).text;
        throw new Error(
          `${params.errorLabel} API error (${response.status}): ${wrapWebContent(
            safeDetail || "request failed",
            "web_fetch",
          )}`,
        );
      }
      return await readContextJsonResponse(
        response,
        `${params.errorLabel}: malformed JSON response`,
        CONTEXT_SCRAPE_RESPONSE_MAX_BYTES,
      );
    },
  );
}

function normalizeSearchMetadataToken(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const bounded = truncateSanitizedExternalContent(value, CONTEXT_SEARCH_METADATA_MAX_CHARS).text;
  return SEARCH_METADATA_TOKEN_RE.test(bounded) ? bounded : undefined;
}

function buildContextSearchPayload(params: {
  payload: Record<string, unknown>;
  query: string;
  count: number;
  tookMs: number;
  scrapeResults: boolean;
}): Record<string, unknown> {
  if (!Array.isArray(params.payload.results)) {
    throw new Error("Context.dev Search returned a malformed results payload.");
  }

  let remainingContentChars = CONTEXT_SEARCH_MAX_CONTENT_CHARS;
  let truncated = params.payload.results.length > params.count;
  const wrapBoundedContent = (value: string): string => {
    if (remainingContentChars <= 0) {
      truncated ||= value.length > 0;
      return "";
    }
    const bounded = truncateSanitizedExternalContent(value, remainingContentChars);
    truncated ||= bounded.truncated;
    remainingContentChars -= bounded.text.length;
    return wrapWebContent(bounded.text, "web_search");
  };

  const results = params.payload.results.slice(0, params.count).flatMap((entry: unknown) => {
    if (!isRecord(entry)) {
      return [];
    }
    const url = normalizeContextResultUrl(entry.url);
    if (!url) {
      return [];
    }
    const markdownResult = isRecord(entry.markdown) ? entry.markdown : undefined;
    const content =
      params.scrapeResults && typeof markdownResult?.markdown === "string"
        ? markdownResult.markdown
        : undefined;
    const siteName = resolveSiteName(url);
    const relevance = normalizeSearchMetadataToken(entry.relevance);
    const scrapeCode = normalizeSearchMetadataToken(markdownResult?.code);
    return [
      {
        title: typeof entry.title === "string" ? wrapBoundedContent(entry.title) : "",
        url,
        description:
          typeof entry.description === "string" ? wrapBoundedContent(entry.description) : "",
        ...(relevance ? { relevance } : {}),
        ...(siteName ? { siteName } : {}),
        ...(content && remainingContentChars > 0 ? { content: wrapBoundedContent(content) } : {}),
        ...(params.scrapeResults && scrapeCode ? { scrapeCode } : {}),
      },
    ];
  });

  return {
    query: params.query,
    provider: "context",
    count: results.length,
    tookMs: params.tookMs,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "context",
      wrapped: true,
    },
    results,
    ...(truncated ? { truncated: true } : {}),
  };
}

export async function runContextSearch(
  params: ContextSearchParams,
): Promise<Record<string, unknown>> {
  params.signal?.throwIfAborted();
  const query = params.query.trim();
  if (!query || query.length > 500) {
    throw new Error("Context.dev search query must contain 1 to 500 characters.");
  }
  const apiKey = requireContextApiKey(params.cfg, "webSearch", "web_search (context)");
  const count =
    typeof params.count === "number" && Number.isFinite(params.count)
      ? Math.max(1, Math.min(CONTEXT_SEARCH_MAX_RESULTS, Math.floor(params.count)))
      : DEFAULT_SEARCH_COUNT;
  const includeDomains = normalizeDomainFilters(params.includeDomains);
  const excludeDomains = normalizeDomainFilters(params.excludeDomains);
  if (includeDomains.length > 0 && excludeDomains.length > 0) {
    throw new Error("Context.dev search accepts includeDomains or excludeDomains, not both.");
  }
  if (params.useMainContentOnly !== undefined && params.scrapeResults !== true) {
    throw new Error("Context.dev search requires scrapeResults when useMainContentOnly is set.");
  }
  const country = normalizeCountry(params.country);
  const timeoutSeconds = resolveTimeoutSeconds(
    params.timeoutSeconds,
    resolveContextSearchTimeoutSeconds(params.timeoutSeconds),
  );
  const scrapeResults = params.scrapeResults === true;
  const requestCount = Math.max(CONTEXT_SEARCH_MIN_REQUEST_RESULTS, count);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({
      type: "context-search",
      query,
      count,
      includeDomains,
      excludeDomains,
      freshness: params.freshness,
      country,
      queryFanout: params.queryFanout,
      scrapeResults,
      useMainContentOnly: params.useMainContentOnly,
    }),
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const body: Record<string, unknown> = {
    query,
    numResults: requestCount,
  };
  if (includeDomains.length > 0) {
    body.includeDomains = includeDomains;
  }
  if (excludeDomains.length > 0) {
    body.excludeDomains = excludeDomains;
  }
  if (params.freshness) {
    body.freshness = params.freshness;
  }
  if (country) {
    body.country = country;
  }
  if (typeof params.queryFanout === "boolean") {
    body.queryFanout = params.queryFanout;
  }
  if (scrapeResults) {
    body.markdownOptions = {
      enabled: true,
      includeLinks: true,
      includeImages: false,
      useMainContentOnly: params.useMainContentOnly ?? false,
    };
  }

  const start = Date.now();
  const payload = await postTrustedWebToolsJson(
    {
      url: CONTEXT_SEARCH_URL,
      timeoutSeconds,
      apiKey,
      body,
      errorLabel: "Context.dev Search",
      extraHeaders: { "X-Client-Source": "openclaw" },
      ...(params.signal ? { signal: params.signal } : {}),
    },
    async (response) =>
      await readContextJsonResponse(
        response,
        "Context.dev Search: malformed JSON response",
        CONTEXT_SEARCH_RESPONSE_MAX_BYTES,
      ),
  );
  const result = buildContextSearchPayload({
    payload,
    query,
    count,
    tookMs: Date.now() - start,
    scrapeResults,
  });
  writeCache(
    SEARCH_CACHE,
    cacheKey,
    result,
    resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES),
  );
  return result;
}

function parseContextScrapePayload(params: {
  payload: Record<string, unknown>;
  url: string;
  extractMode: "markdown" | "text";
  maxChars: number;
}): Record<string, unknown> {
  if (params.payload.success !== true || typeof params.payload.markdown !== "string") {
    throw new Error("Context.dev scrape returned a malformed response.");
  }
  const metadata = isRecord(params.payload.metadata) ? params.payload.metadata : undefined;
  const rawText =
    params.extractMode === "text"
      ? markdownToText(params.payload.markdown)
      : params.payload.markdown;
  const boundedText = truncateSanitizedExternalContent(rawText, params.maxChars);
  let truncated = boundedText.truncated;
  let remainingMetadataChars = CONTEXT_SCRAPE_METADATA_MAX_CHARS;
  const wrapBoundedMetadata = (value: string): string => {
    const bounded = truncateSanitizedExternalContent(value, remainingMetadataChars);
    truncated ||= bounded.truncated;
    remainingMetadataChars -= bounded.text.length;
    return wrapExternalContent(bounded.text, { source: "web_fetch", includeWarning: false });
  };
  const wrappedText = wrapExternalContent(boundedText.text, {
    source: "web_fetch",
    includeWarning: false,
  });
  const finalUrl =
    normalizeContextResultUrl(metadata?.finalUrl) ??
    normalizeContextResultUrl(params.payload.url) ??
    params.url;
  const title =
    typeof metadata?.title === "string" && metadata.title
      ? wrapBoundedMetadata(metadata.title)
      : undefined;

  return {
    url: params.url,
    finalUrl,
    status: 200,
    ...(title ? { title } : {}),
    extractor: "context",
    extractMode: params.extractMode,
    externalContent: {
      untrusted: true,
      source: "web_fetch",
      provider: "context",
      wrapped: true,
    },
    truncated,
    rawLength: rawText.length,
    length: wrappedText.length,
    text: wrappedText,
  };
}

export async function runContextScrape(
  params: ContextScrapeParams,
): Promise<Record<string, unknown>> {
  params.signal?.throwIfAborted();
  assertContextScrapeTargetAllowed(params.url);
  const apiKey = requireContextApiKey(params.cfg, "webFetch", "context_scrape");
  const timeoutSeconds = resolveTimeoutSeconds(
    params.timeoutSeconds,
    resolveContextScrapeTimeoutSeconds(params.timeoutSeconds),
  );
  const configuredMaxCharsCap = params.cfg?.tools?.web?.fetch?.maxCharsCap;
  const maxCharsCap =
    typeof configuredMaxCharsCap === "number" &&
    Number.isFinite(configuredMaxCharsCap) &&
    configuredMaxCharsCap > 0
      ? Math.floor(configuredMaxCharsCap)
      : DEFAULT_SCRAPE_MAX_CHARS;
  const requestedMaxChars =
    typeof params.maxChars === "number" && Number.isFinite(params.maxChars) && params.maxChars > 0
      ? Math.floor(params.maxChars)
      : DEFAULT_SCRAPE_MAX_CHARS;
  const maxChars = Math.min(requestedMaxChars, maxCharsCap);
  const country = normalizeCountry(params.country);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({
      type: "context-scrape",
      url: params.url,
      extractMode: params.extractMode,
      maxChars,
      includeLinks: params.includeLinks,
      includeImages: params.includeImages,
      useMainContentOnly: params.useMainContentOnly,
      includeFrames: params.includeFrames,
      maxAgeMs: params.maxAgeMs,
      waitForMs: params.waitForMs,
      settleAnimations: params.settleAnimations,
      country,
    }),
  );
  if (params.maxAgeMs !== 0) {
    const cached = readCache(SCRAPE_CACHE, cacheKey);
    if (cached) {
      return { ...cached.value, cached: true };
    }
  }

  const endpoint = new URL(CONTEXT_SCRAPE_URL);
  endpoint.searchParams.set("url", params.url);
  endpoint.searchParams.set("timeoutMS", String(timeoutSeconds * 1_000));
  if (typeof params.includeLinks === "boolean") {
    endpoint.searchParams.set("includeLinks", String(params.includeLinks));
  }
  if (typeof params.includeImages === "boolean") {
    endpoint.searchParams.set("includeImages", String(params.includeImages));
  }
  if (typeof params.useMainContentOnly === "boolean") {
    endpoint.searchParams.set("useMainContentOnly", String(params.useMainContentOnly));
  }
  if (typeof params.includeFrames === "boolean") {
    endpoint.searchParams.set("includeFrames", String(params.includeFrames));
  }
  if (typeof params.maxAgeMs === "number") {
    endpoint.searchParams.set("maxAgeMs", String(params.maxAgeMs));
  }
  if (typeof params.waitForMs === "number") {
    endpoint.searchParams.set("waitForMs", String(params.waitForMs));
  }
  if (typeof params.settleAnimations === "boolean") {
    endpoint.searchParams.set("settleAnimations", String(params.settleAnimations));
  }
  if (country) {
    endpoint.searchParams.set("country", country);
  }

  const payload = await getContextJson({
    url: endpoint.toString(),
    timeoutSeconds,
    apiKey,
    errorLabel: "Context.dev Scrape",
    ...(params.signal ? { signal: params.signal } : {}),
  });
  const result = parseContextScrapePayload({
    payload,
    url: params.url,
    extractMode: params.extractMode,
    maxChars,
  });
  if (params.maxAgeMs !== 0) {
    const defaultCacheTtlMs = resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES);
    const cacheTtlMs =
      typeof params.maxAgeMs === "number"
        ? Math.min(defaultCacheTtlMs, Math.max(0, Math.floor(params.maxAgeMs)))
        : defaultCacheTtlMs;
    writeCache(SCRAPE_CACHE, cacheKey, result, cacheTtlMs);
  }
  return result;
}

export const testing = {
  assertContextScrapeTargetAllowed,
  buildContextSearchPayload,
  normalizeContextResultUrl,
  parseContextScrapePayload,
};
