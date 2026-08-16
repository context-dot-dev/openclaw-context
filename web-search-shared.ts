import {
  createWebSearchProviderContractFields,
  enablePluginInConfig,
  type WebSearchProviderPlugin,
} from "openclaw/plugin-sdk/provider-web-search-contract";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";

const CONTEXT_SEARCH_CREDENTIAL_PATH = "plugins.entries.context.config.webSearch.apiKey";
const CONTEXT_FETCH_CREDENTIAL_PATH = "plugins.entries.context.config.webFetch.apiKey";

function getConfiguredContextFetchCredentialFallback(config?: {
  plugins?: { entries?: { context?: { config?: unknown } } };
}) {
  const pluginConfig = config?.plugins?.entries?.context?.config;
  const webFetch = isRecord(pluginConfig) ? pluginConfig.webFetch : undefined;
  const apiKey = isRecord(webFetch) ? webFetch.apiKey : undefined;
  return apiKey === undefined
    ? undefined
    : {
        path: CONTEXT_FETCH_CREDENTIAL_PATH,
        value: apiKey,
      };
}

export const CONTEXT_GENERIC_SEARCH_DESCRIPTION =
  "Search the live web using Context.dev. Returns ranked results with snippets. Use context_search for domain filters, freshness, country targeting, query fanout, or scraped result content.";

export const CONTEXT_GENERIC_SEARCH_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query string." },
    count: {
      type: "integer",
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: 10,
    },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

export function buildContextWebSearchProviderBase(): Omit<WebSearchProviderPlugin, "createTool"> {
  const contractFields = createWebSearchProviderContractFields({
    credentialPath: CONTEXT_SEARCH_CREDENTIAL_PATH,
    searchCredential: { type: "scoped", scopeId: "context" },
    configuredCredential: { pluginId: "context" },
  });

  return {
    id: "context",
    label: "Context.dev Search",
    hint: "Live web search with domain, freshness, country, and result-scraping controls",
    onboardingScopes: ["text-inference"],
    credentialLabel: "Context.dev API key",
    envVars: ["CONTEXT_API_KEY"],
    placeholder: "brand_...",
    signupUrl: "https://www.context.dev/",
    docsUrl: "https://docs.openclaw.ai/tools/context",
    autoDetectOrder: 80,
    credentialPath: CONTEXT_SEARCH_CREDENTIAL_PATH,
    ...contractFields,
    applySelectionConfig: (config) => {
      const enabled = enablePluginInConfig(config, "context");
      if (!enabled.enabled || enabled.config.tools?.web?.fetch?.provider) {
        return enabled.config;
      }
      return {
        ...enabled.config,
        tools: {
          ...enabled.config.tools,
          web: {
            ...enabled.config.tools?.web,
            fetch: {
              ...enabled.config.tools?.web?.fetch,
              provider: "context",
            },
          },
        },
      };
    },
    getConfiguredCredentialFallback: getConfiguredContextFetchCredentialFallback,
  };
}
