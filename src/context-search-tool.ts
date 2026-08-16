import { optionalStringEnum } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import {
  jsonResult,
  readPositiveIntegerParam,
  readStringArrayParam,
  readStringParam,
} from "openclaw/plugin-sdk/provider-web-search";
import { Type } from "typebox";
import { runContextSearch, type ContextFreshness } from "./context-client.js";
import { resolveContextToolConfig, type ContextToolConfigContext } from "./context-tool-config.js";

const ContextSearchToolSchema = Type.Object(
  {
    query: Type.String({ description: "Search query string (1-500 characters)." }),
    count: Type.Optional(
      Type.Integer({
        description: "Number of results to return (1-100).",
        minimum: 1,
        maximum: 100,
      }),
    ),
    includeDomains: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "Only return results from these domains. Cannot be combined with excludeDomains.",
      }),
    ),
    excludeDomains: Type.Optional(
      Type.Array(Type.String(), {
        description: "Exclude these domains. Cannot be combined with includeDomains.",
      }),
    ),
    freshness: optionalStringEnum(
      ["last_24_hours", "last_week", "last_month", "last_year"] as const,
      { description: "Restrict results to content published within this window." },
    ),
    country: Type.Optional(
      Type.String({
        description: "Two-letter ISO country code for residential geo-targeting, such as us or de.",
        pattern: "^[A-Za-z]{2}$",
      }),
    ),
    queryFanout: Type.Optional(
      Type.Boolean({
        description: "Generate related searches to improve recall for broad research queries.",
      }),
    ),
    scrapeResults: Type.Optional(
      Type.Boolean({
        description: "Also scrape each search result and include its Markdown content.",
      }),
    ),
    useMainContentOnly: Type.Optional(
      Type.Boolean({
        description: "When scrapeResults is true, remove navigation, footers, and sidebars.",
      }),
    ),
    timeoutSeconds: Type.Optional(
      Type.Integer({
        description: "Timeout in seconds for the Context.dev search request (1-300).",
        minimum: 1,
        maximum: 300,
      }),
    ),
  },
  { additionalProperties: false },
);

function isContextFreshness(value: string | undefined): value is ContextFreshness {
  return (
    value === "last_24_hours" ||
    value === "last_week" ||
    value === "last_month" ||
    value === "last_year"
  );
}

export function createContextSearchTool(api: OpenClawPluginApi, ctx?: ContextToolConfigContext) {
  return {
    name: "context_search",
    label: "Context.dev Search",
    resultContentSource: "network" as const,
    description:
      "Search the live web with Context.dev. Supports domain allowlists and blocklists, freshness windows, country targeting, query fanout, and optional Markdown scraping of every result.",
    parameters: ContextSearchToolSchema,
    execute: async (
      _toolCallId: string,
      rawParams: Record<string, unknown>,
      signal?: AbortSignal,
    ) => {
      signal?.throwIfAborted();
      const freshnessValue = readStringParam(rawParams, "freshness");
      const freshness = isContextFreshness(freshnessValue) ? freshnessValue : undefined;

      return jsonResult(
        await runContextSearch({
          cfg: resolveContextToolConfig(api, ctx),
          query: readStringParam(rawParams, "query", { required: true }),
          count: readPositiveIntegerParam(rawParams, "count", {
            max: 100,
            message: "count must be an integer from 1 to 100.",
          }),
          includeDomains: readStringArrayParam(rawParams, "includeDomains"),
          excludeDomains: readStringArrayParam(rawParams, "excludeDomains"),
          freshness,
          country: readStringParam(rawParams, "country") || undefined,
          queryFanout:
            typeof rawParams.queryFanout === "boolean" ? rawParams.queryFanout : undefined,
          scrapeResults:
            typeof rawParams.scrapeResults === "boolean" ? rawParams.scrapeResults : undefined,
          useMainContentOnly:
            typeof rawParams.useMainContentOnly === "boolean"
              ? rawParams.useMainContentOnly
              : undefined,
          timeoutSeconds: readPositiveIntegerParam(rawParams, "timeoutSeconds", {
            max: 300,
            message: "timeoutSeconds must be an integer from 1 to 300.",
          }),
          ...(signal ? { signal } : {}),
        }),
      );
    },
  };
}
