import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "openclaw.plugin.json"), "utf8"),
) as Record<string, unknown>;
const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8");
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
  it("uses supported manifest metadata and documents the OAuth MCP connection", () => {
    expect(manifest.name).toBe("Context.dev");
    expect(manifest).not.toHaveProperty("mcpServers");
    expect(readme).toContain("openclaw mcp add context");
    expect(readme).toContain("https://mcp.context.dev/mcp");
    expect(readme).toContain("openclaw mcp login context");
  });

  it("publishes compiled output compatible with the released plugin API", () => {
    expect(packageManifest.openclaw).toMatchObject({
      extensions: ["./dist/index.js"],
      install: { minHostVersion: ">=2026.7.1-2" },
      compat: { pluginApi: ">=2026.7.1-2" },
    });
  });
});
