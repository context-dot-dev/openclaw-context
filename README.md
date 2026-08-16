# OpenClaw Context.dev Plugin

Official OpenClaw plugin for Context.dev web search, scraping, extraction,
document parsing, brand intelligence, monitors, and batch jobs.

Install from OpenClaw:

```bash
openclaw plugins install @openclaw/context-plugin
openclaw gateway restart
```

Add the bundled Context.dev MCP server to operator config, then connect it to
expose the complete official Context MCP toolset:

```bash
openclaw mcp add context \
  --url https://mcp.context.dev/mcp \
  --transport streamable-http \
  --auth oauth \
  --parallel \
  --connect-timeout 30 \
  --timeout 180
openclaw mcp login context
```

See <https://docs.openclaw.ai/tools/context> for setup and configuration.
