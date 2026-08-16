import { readPositiveIntegerParam } from "openclaw/plugin-sdk/param-readers";
import {
  enablePluginInConfig,
  type WebFetchProviderPlugin,
} from "openclaw/plugin-sdk/provider-web-fetch-contract";
import { CONTEXT_WEB_FETCH_PROVIDER_SHARED } from "./context-fetch-provider-shared.js";

type ContextClientModule = typeof import("./context-client.js");

let contextClientModulePromise: Promise<ContextClientModule> | undefined;

function loadContextClientModule(): Promise<ContextClientModule> {
  contextClientModulePromise ??= import("./context-client.js");
  return contextClientModulePromise;
}

export function createContextWebFetchProvider(): WebFetchProviderPlugin {
  return {
    ...CONTEXT_WEB_FETCH_PROVIDER_SHARED,
    applySelectionConfig: (config) => enablePluginInConfig(config, "context").config,
    createTool: ({ config }) => ({
      description: "Fetch a page using Context.dev.",
      parameters: {},
      execute: async (args) => {
        const { runContextScrape } = await loadContextClientModule();
        return await runContextScrape({
          cfg: config,
          url: typeof args.url === "string" ? args.url : "",
          extractMode: args.extractMode === "text" ? "text" : "markdown",
          maxChars: readPositiveIntegerParam(args, "maxChars"),
        });
      },
    }),
  };
}
