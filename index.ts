import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createContextWebFetchProvider } from "./src/context-fetch-provider.js";
import { createContextScrapeTool } from "./src/context-scrape-tool.js";
import { createContextWebSearchProvider } from "./src/context-search-provider.js";
import { createContextSearchTool } from "./src/context-search-tool.js";

export default definePluginEntry({
  id: "context",
  name: "Context.dev Plugin",
  description:
    "Context.dev web search, scraping, extraction, parsing, brand intelligence, monitors, and batches for OpenClaw",
  register(api) {
    api.registerWebSearchProvider(createContextWebSearchProvider());
    api.registerWebFetchProvider(createContextWebFetchProvider());
    api.registerTool((ctx) => createContextSearchTool(api, ctx), { name: "context_search" });
    api.registerTool((ctx) => createContextScrapeTool(api, ctx), { name: "context_scrape" });
  },
});
