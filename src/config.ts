import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { canResolveEnvSecretRefInReadOnlyPath } from "openclaw/plugin-sdk/extension-shared";
import { resolvePositiveTimeoutSeconds } from "openclaw/plugin-sdk/provider-web-search";
import { normalizeSecretInput, resolveSecretInputString } from "openclaw/plugin-sdk/secret-input";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";

const CONTEXT_API_KEY_ENV_VAR = "CONTEXT_API_KEY";
const CONTEXT_SEARCH_KEY_PATH = "plugins.entries.context.config.webSearch.apiKey";
const CONTEXT_FETCH_KEY_PATH = "plugins.entries.context.config.webFetch.apiKey";
const DEFAULT_CONTEXT_SEARCH_TIMEOUT_SECONDS = 30;
const DEFAULT_CONTEXT_SCRAPE_TIMEOUT_SECONDS = 60;

type ContextPluginConfig = {
  webSearch?: { apiKey?: unknown };
  webFetch?: { apiKey?: unknown };
};

type ConfiguredSecretResolution =
  | { status: "available"; value: string }
  | { status: "missing" }
  | { status: "blocked" };

function resolveContextPluginConfig(cfg?: OpenClawConfig): ContextPluginConfig | undefined {
  const value = cfg?.plugins?.entries?.context?.config;
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    webSearch: isRecord(value.webSearch) ? value.webSearch : undefined,
    webFetch: isRecord(value.webFetch) ? value.webFetch : undefined,
  };
}

function resolveConfiguredSecret(
  value: unknown,
  path: string,
  cfg?: OpenClawConfig,
): ConfiguredSecretResolution {
  const resolved = resolveSecretInputString({
    value,
    path,
    defaults: cfg?.secrets?.defaults,
    mode: "inspect",
  });
  if (resolved.status === "available") {
    const normalized = normalizeSecretInput(resolved.value);
    return normalized ? { status: "available", value: normalized } : { status: "missing" };
  }
  if (resolved.status === "missing") {
    return { status: "missing" };
  }
  if (resolved.ref.source !== "env" || resolved.ref.id.trim() !== CONTEXT_API_KEY_ENV_VAR) {
    return { status: "blocked" };
  }
  if (
    !canResolveEnvSecretRefInReadOnlyPath({
      cfg,
      provider: resolved.ref.provider,
      id: CONTEXT_API_KEY_ENV_VAR,
    })
  ) {
    return { status: "blocked" };
  }
  const envValue = normalizeSecretInput(process.env[CONTEXT_API_KEY_ENV_VAR]);
  return envValue ? { status: "available", value: envValue } : { status: "missing" };
}

export function resolveContextApiKey(
  cfg?: OpenClawConfig,
  preferred: "webSearch" | "webFetch" = "webSearch",
): string | undefined {
  const config = resolveContextPluginConfig(cfg);
  const candidates =
    preferred === "webSearch"
      ? [
          { value: config?.webSearch?.apiKey, path: CONTEXT_SEARCH_KEY_PATH },
          { value: config?.webFetch?.apiKey, path: CONTEXT_FETCH_KEY_PATH },
        ]
      : [
          { value: config?.webFetch?.apiKey, path: CONTEXT_FETCH_KEY_PATH },
          { value: config?.webSearch?.apiKey, path: CONTEXT_SEARCH_KEY_PATH },
        ];

  for (const candidate of candidates) {
    const resolved = resolveConfiguredSecret(candidate.value, candidate.path, cfg);
    if (resolved.status === "available") {
      return resolved.value;
    }
    if (resolved.status === "blocked") {
      return undefined;
    }
  }
  return normalizeSecretInput(process.env[CONTEXT_API_KEY_ENV_VAR]) || undefined;
}

export function resolveContextSearchTimeoutSeconds(override?: number): number {
  return resolvePositiveTimeoutSeconds(override, DEFAULT_CONTEXT_SEARCH_TIMEOUT_SECONDS);
}

export function resolveContextScrapeTimeoutSeconds(override?: number): number {
  return resolvePositiveTimeoutSeconds(override, DEFAULT_CONTEXT_SCRAPE_TIMEOUT_SECONDS);
}
