import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveContextApiKey } from "./config.js";

function configWithKeys(params: {
  webSearch?: unknown;
  webFetch?: unknown;
  extra?: Partial<OpenClawConfig>;
}): OpenClawConfig {
  return {
    ...params.extra,
    plugins: {
      entries: {
        context: {
          config: {
            webSearch: { apiKey: params.webSearch },
            webFetch: { apiKey: params.webFetch },
          },
        },
      },
    },
  } as OpenClawConfig;
}

describe("resolveContextApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the credential for the active capability", () => {
    const config = configWithKeys({ webSearch: "search-key", webFetch: "fetch-key" });

    expect(resolveContextApiKey(config, "webSearch")).toBe("search-key");
    expect(resolveContextApiKey(config, "webFetch")).toBe("fetch-key");
  });

  it("shares one configured credential across search and fetch", () => {
    expect(resolveContextApiKey(configWithKeys({ webSearch: "shared-key" }), "webFetch")).toBe(
      "shared-key",
    );
    expect(resolveContextApiKey(configWithKeys({ webFetch: "shared-key" }), "webSearch")).toBe(
      "shared-key",
    );
  });

  it("falls back to CONTEXT_API_KEY", () => {
    vi.stubEnv("CONTEXT_API_KEY", "env-key");

    expect(resolveContextApiKey()).toBe("env-key");
  });

  it("resolves the matching env SecretRef", () => {
    vi.stubEnv("CONTEXT_API_KEY", "env-key");

    expect(
      resolveContextApiKey(
        configWithKeys({
          webSearch: {
            source: "env",
            provider: "default",
            id: "CONTEXT_API_KEY",
          },
        }),
      ),
    ).toBe("env-key");
  });

  it.each([
    {
      source: "file",
      provider: "default",
      id: "/etc/secrets/context",
    },
    {
      source: "exec",
      provider: "default",
      id: "CONTEXT_API_KEY",
    },
    {
      source: "env",
      provider: "default",
      id: "OTHER_API_KEY",
    },
  ])("does not bypass an unavailable configured SecretRef", (webSearch) => {
    vi.stubEnv("CONTEXT_API_KEY", "env-key");

    expect(resolveContextApiKey(configWithKeys({ webSearch }))).toBeUndefined();
  });
});
