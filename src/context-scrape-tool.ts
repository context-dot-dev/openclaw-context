import { optionalStringEnum } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import {
  jsonResult,
  readNonNegativeIntegerParam,
  readPositiveIntegerParam,
  readStringParam,
} from "openclaw/plugin-sdk/provider-web-search";
import { Type } from "typebox";
import { runContextScrape } from "./context-client.js";
import { resolveContextToolConfig, type ContextToolConfigContext } from "./context-tool-config.js";

const ContextScrapeToolSchema = Type.Object(
  {
    url: Type.String({ description: "HTTP or HTTPS URL to scrape with Context.dev." }),
    extractMode: optionalStringEnum(["markdown", "text"] as const, {
      description: 'Extraction mode: "markdown" (default) or plain "text".',
    }),
    maxChars: Type.Optional(
      Type.Integer({
        description: "Maximum number of content characters to return.",
        minimum: 100,
      }),
    ),
    includeLinks: Type.Optional(
      Type.Boolean({ description: "Preserve hyperlinks in Markdown output (default: true)." }),
    ),
    includeImages: Type.Optional(
      Type.Boolean({ description: "Include image references in Markdown output." }),
    ),
    useMainContentOnly: Type.Optional(
      Type.Boolean({ description: "Remove navigation, footers, sidebars, and other page chrome." }),
    ),
    includeFrames: Type.Optional(
      Type.Boolean({ description: "Include iframe contents in the Markdown output." }),
    ),
    maxAgeMs: Type.Optional(
      Type.Integer({
        description: "Maximum cached scrape age in milliseconds. Set 0 to always scrape fresh.",
        minimum: 0,
        maximum: 2592000000,
      }),
    ),
    waitForMs: Type.Optional(
      Type.Integer({
        description: "Wait after page load before extraction, in milliseconds (0-30000).",
        minimum: 0,
        maximum: 30000,
      }),
    ),
    settleAnimations: Type.Optional(
      Type.Boolean({ description: "Wait briefly for CSS transitions and animations to settle." }),
    ),
    country: Type.Optional(
      Type.String({
        description: "Two-letter ISO country code for residential geo-targeting, such as us or de.",
        pattern: "^[A-Za-z]{2}$",
      }),
    ),
    timeoutSeconds: Type.Optional(
      Type.Integer({
        description: "Timeout in seconds for the Context.dev scrape request (1-300).",
        minimum: 1,
        maximum: 300,
      }),
    ),
  },
  { additionalProperties: false },
);

export function createContextScrapeTool(api: OpenClawPluginApi, ctx?: ContextToolConfigContext) {
  return {
    name: "context_scrape",
    label: "Context.dev Scrape",
    resultContentSource: "network" as const,
    description:
      "Scrape a URL into clean Markdown or text with Context.dev. Handles JavaScript-rendered pages, PDFs, YouTube videos, country targeting, cache control, and delayed content without browser actions.",
    parameters: ContextScrapeToolSchema,
    execute: async (
      _toolCallId: string,
      rawParams: Record<string, unknown>,
      signal?: AbortSignal,
    ) => {
      signal?.throwIfAborted();
      return jsonResult(
        await runContextScrape({
          cfg: resolveContextToolConfig(api, ctx),
          url: readStringParam(rawParams, "url", { required: true }),
          extractMode: readStringParam(rawParams, "extractMode") === "text" ? "text" : "markdown",
          maxChars: readPositiveIntegerParam(rawParams, "maxChars"),
          includeLinks:
            typeof rawParams.includeLinks === "boolean" ? rawParams.includeLinks : undefined,
          includeImages:
            typeof rawParams.includeImages === "boolean" ? rawParams.includeImages : undefined,
          useMainContentOnly:
            typeof rawParams.useMainContentOnly === "boolean"
              ? rawParams.useMainContentOnly
              : undefined,
          includeFrames:
            typeof rawParams.includeFrames === "boolean" ? rawParams.includeFrames : undefined,
          maxAgeMs: readNonNegativeIntegerParam(rawParams, "maxAgeMs", {
            max: 2592000000,
            message: "maxAgeMs must be an integer from 0 to 2592000000.",
          }),
          waitForMs: readNonNegativeIntegerParam(rawParams, "waitForMs", {
            max: 30000,
            message: "waitForMs must be an integer from 0 to 30000.",
          }),
          settleAnimations:
            typeof rawParams.settleAnimations === "boolean"
              ? rawParams.settleAnimations
              : undefined,
          country: readStringParam(rawParams, "country") || undefined,
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
