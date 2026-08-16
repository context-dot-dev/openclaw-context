import {
  enablePluginInConfig,
  type WebFetchProviderPlugin,
} from "openclaw/plugin-sdk/provider-web-fetch-contract";
import { CONTEXT_WEB_FETCH_PROVIDER_SHARED } from "./src/context-fetch-provider-shared.js";

export function createContextWebFetchProvider(): WebFetchProviderPlugin {
  return {
    ...CONTEXT_WEB_FETCH_PROVIDER_SHARED,
    applySelectionConfig: (config) => enablePluginInConfig(config, "context").config,
    createTool: () => null,
  };
}
