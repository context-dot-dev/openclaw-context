import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search-contract";
import { buildContextWebSearchProviderBase } from "./web-search-shared.js";

export function createContextWebSearchProvider(): WebSearchProviderPlugin {
  return {
    ...buildContextWebSearchProviderBase(),
    createTool: () => null,
  };
}
