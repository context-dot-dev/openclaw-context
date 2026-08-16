import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { describe, expect, it, vi } from "vitest";
import { createContextWebFetchProvider as createContractContextWebFetchProvider } from "../web-fetch-contract-api.js";
import { createContextWebSearchProvider as createContractContextWebSearchProvider } from "../web-search-contract-api.js";
import { createContextWebFetchProvider } from "./context-fetch-provider.js";
import { createContextScrapeTool } from "./context-scrape-tool.js";
import { createContextWebSearchProvider } from "./context-search-provider.js";
import { createContextSearchTool } from "./context-search-tool.js";

vi.mock("./context-client.js", () => ({
  runContextSearch: vi.fn(async (params: Record<string, unknown>) => params),
  runContextScrape: vi.fn(async (params: Record<string, unknown>) => params),
}));

const api = {
  config: { plugins: { entries: { context: { config: {} } } } },
} as unknown as OpenClawPluginApi;

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  const content = result.content[0];
  return content?.type === "text" ? (content.text ?? "") : "";
}

describe("Context.dev providers", () => {
  it("keeps runtime and lightweight search contracts aligned", () => {
    const runtime = createContextWebSearchProvider();
    const contract = createContractContextWebSearchProvider();

    expect({
      id: contract.id,
      label: contract.label,
      hint: contract.hint,
      envVars: contract.envVars,
      docsUrl: contract.docsUrl,
      autoDetectOrder: contract.autoDetectOrder,
      credentialPath: contract.credentialPath,
    }).toEqual({
      id: runtime.id,
      label: runtime.label,
      hint: runtime.hint,
      envVars: runtime.envVars,
      docsUrl: runtime.docsUrl,
      autoDetectOrder: runtime.autoDetectOrder,
      credentialPath: runtime.credentialPath,
    });
    expect(contract.createTool({ config: {}, searchConfig: {} })).toBeNull();
  });

  it("keeps runtime and lightweight fetch contracts aligned", () => {
    const runtime = createContextWebFetchProvider();
    const contract = createContractContextWebFetchProvider();

    expect({
      id: contract.id,
      label: contract.label,
      hint: contract.hint,
      envVars: contract.envVars,
      docsUrl: contract.docsUrl,
      autoDetectOrder: contract.autoDetectOrder,
      credentialPath: contract.credentialPath,
    }).toEqual({
      id: runtime.id,
      label: runtime.label,
      hint: runtime.hint,
      envVars: runtime.envVars,
      docsUrl: runtime.docsUrl,
      autoDetectOrder: runtime.autoDetectOrder,
      credentialPath: runtime.credentialPath,
    });
    expect(contract.createTool({ config: {}, fetchConfig: {} })).toBeNull();
  });

  it("enables the plugin and pairs Context.dev search with Context.dev fetch", () => {
    const provider = createContextWebSearchProvider();
    const applied = provider.applySelectionConfig?.({});

    expect(applied?.plugins?.entries?.context?.enabled).toBe(true);
    expect(applied?.tools?.web?.fetch?.provider).toBe("context");
  });

  it("preserves an explicitly selected fetch provider", () => {
    const provider = createContextWebSearchProvider();
    const applied = provider.applySelectionConfig?.({
      tools: { web: { fetch: { provider: "firecrawl" } } },
    });

    expect(applied?.tools?.web?.fetch?.provider).toBe("firecrawl");
  });
});

describe("Context.dev tools", () => {
  it("forwards advanced search controls and runtime config", async () => {
    const tool = createContextSearchTool(api, {
      config: {},
      runtimeConfig: { plugins: { entries: { context: { enabled: true } } } },
    });
    const result = await tool.execute("call", {
      query: "latest launches",
      count: 12,
      includeDomains: ["stripe.com"],
      freshness: "last_week",
      country: "us",
      queryFanout: true,
      scrapeResults: true,
      useMainContentOnly: true,
      timeoutSeconds: 25,
    });

    expect(resultText(result)).toContain('"query": "latest launches"');
    expect(resultText(result)).toContain('"scrapeResults": true');
  });

  it("forwards read-only scrape controls", async () => {
    const tool = createContextScrapeTool(api);
    const result = await tool.execute("call", {
      url: "https://example.com",
      extractMode: "text",
      maxChars: 5000,
      includeLinks: false,
      includeImages: true,
      useMainContentOnly: true,
      includeFrames: true,
      maxAgeMs: 0,
      waitForMs: 100,
      settleAnimations: true,
      country: "de",
      timeoutSeconds: 40,
    });

    expect(resultText(result)).toContain('"extractMode": "text"');
    expect(resultText(result)).not.toContain("actions");
    expect(resultText(result)).not.toContain("headers");
  });
});
