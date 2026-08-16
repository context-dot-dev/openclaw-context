import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "openclaw.plugin.json"), "utf8"),
) as Record<string, unknown>;
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"),
) as {
  openclaw?: {
    extensions?: string[];
    install?: { minHostVersion?: string };
    compat?: { pluginApi?: string };
  };
};

describe("Context.dev plugin manifest", () => {
  it("contributes the official OAuth-backed MCP server", () => {
    expect(manifest.mcpServers).toEqual({
      context: {
        transport: "streamable-http",
        url: "https://mcp.context.dev/mcp",
        auth: "oauth",
        supportsParallelToolCalls: true,
        connectionTimeoutMs: 30_000,
        requestTimeoutMs: 180_000,
      },
    });
  });

  it("publishes compiled output compatible with the released plugin API", () => {
    expect(packageManifest.openclaw).toMatchObject({
      extensions: ["./dist/index.js"],
      install: { minHostVersion: ">=2026.7.1-2" },
      compat: { pluginApi: ">=2026.7.1-2" },
    });
  });
});
