# OpenClaw Context.dev Plugin

Context.dev web search and scraping for OpenClaw, with OAuth access to the
complete public Context.dev MCP catalog.

Install from OpenClaw:

```bash
openclaw plugins install clawhub:@contextdev/openclaw-context
openclaw gateway restart
```

Set `CONTEXT_API_KEY` to use Context.dev as OpenClaw's native `web_search` and
`web_fetch` provider or call the dedicated `context_search` and
`context_scrape` tools.

Add and connect the Context.dev MCP server through OAuth to expose the complete
public tool catalog:

```bash
openclaw mcp add context \
  --url https://mcp.context.dev/mcp \
  --transport streamable-http \
  --auth oauth \
  --parallel \
  --connect-timeout 30 \
  --timeout 180 \
  --no-probe
openclaw mcp login context
```

The MCP connection includes search, scraping, crawling, structured extraction,
document parsing, brand intelligence, monitors, screenshots, and batch jobs.

Run `openclaw mcp probe context` to verify the connection and list the available
tools.

See <https://docs.context.dev> for Context.dev API documentation and
<https://www.context.dev/term> for terms of use.
