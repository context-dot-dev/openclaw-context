import type { WebFetchProviderPlugin } from "openclaw/plugin-sdk/provider-web-fetch-contract";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";

function ensureRecord(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = target[key];
  if (isRecord(current)) {
    return current;
  }
  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function readConfiguredApiKey(config: unknown, capability: "webSearch" | "webFetch"): unknown {
  if (!isRecord(config)) {
    return undefined;
  }
  const section = config[capability];
  return isRecord(section) ? section.apiKey : undefined;
}

export const CONTEXT_WEB_FETCH_PROVIDER_SHARED = {
  id: "context",
  label: "Context.dev",
  hint: "Scrape pages into clean markdown, including JavaScript-rendered sites and PDFs",
  credentialLabel: "Context.dev API key",
  envVars: ["CONTEXT_API_KEY"],
  placeholder: "brand_...",
  signupUrl: "https://www.context.dev/",
  docsUrl: "https://docs.openclaw.ai/tools/context",
  autoDetectOrder: 60,
  credentialPath: "plugins.entries.context.config.webFetch.apiKey",
  inactiveSecretPaths: ["plugins.entries.context.config.webFetch.apiKey"],
  getCredentialValue: (fetchConfig) => {
    const context = fetchConfig?.context;
    return isRecord(context) ? context.apiKey : undefined;
  },
  setCredentialValue: (fetchConfigTarget, value) => {
    const context = ensureRecord(fetchConfigTarget, "context");
    context.apiKey = value;
  },
  getConfiguredCredentialValue: (config) =>
    readConfiguredApiKey(config?.plugins?.entries?.context?.config, "webFetch"),
  getConfiguredCredentialFallback: (config) => {
    const apiKey = readConfiguredApiKey(config?.plugins?.entries?.context?.config, "webSearch");
    return apiKey === undefined
      ? undefined
      : {
          path: "plugins.entries.context.config.webSearch.apiKey",
          value: apiKey,
        };
  },
  setConfiguredCredentialValue: (configTarget, value) => {
    const plugins = (configTarget.plugins ??= {});
    const entries = (plugins.entries ??= {});
    const contextEntry = (entries.context ??= {});
    if (contextEntry.enabled === undefined) {
      contextEntry.enabled = true;
    }
    const pluginConfig = (contextEntry.config ??= {});
    const webFetch = ensureRecord(pluginConfig, "webFetch");
    webFetch.apiKey = value;
  },
} satisfies Omit<WebFetchProviderPlugin, "applySelectionConfig" | "createTool">;
