import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import { readPositiveIntegerParam } from "openclaw/plugin-sdk/param-readers";
import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search-contract";
import {
  buildContextWebSearchProviderBase,
  CONTEXT_GENERIC_SEARCH_DESCRIPTION,
  CONTEXT_GENERIC_SEARCH_SCHEMA,
} from "../web-search-shared.js";

const loadContextClientModule = createLazyRuntimeModule(() => import("./context-client.js"));

export function createContextWebSearchProvider(): WebSearchProviderPlugin {
  return {
    ...buildContextWebSearchProviderBase(),
    createTool: (ctx) => ({
      description: CONTEXT_GENERIC_SEARCH_DESCRIPTION,
      parameters: CONTEXT_GENERIC_SEARCH_SCHEMA,
      execute: async (args, executionContext) => {
        executionContext?.signal?.throwIfAborted();
        const { runContextSearch } = await loadContextClientModule();
        return await runContextSearch({
          cfg: ctx.config,
          query: typeof args.query === "string" ? args.query : "",
          count: readPositiveIntegerParam(args, "count", {
            message: "count must be an integer from 1 to 10",
            max: 10,
          }),
          ...(executionContext?.signal ? { signal: executionContext.signal } : {}),
        });
      },
    }),
  };
}
