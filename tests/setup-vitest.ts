import { afterEach, beforeEach, vi } from "vitest";

const defaultEnv = {
  ALLOW_DEMO_MODE: "true",
  MCP_DEFAULT_TIMEZONE: "America/New_York",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const env = new Map<string, string | undefined>(Object.entries(defaultEnv));

Object.defineProperty(globalThis, "Deno", {
  configurable: true,
  value: {
    env: {
      get(key: string) {
        return env.get(key);
      },
    },
    serve: vi.fn(),
  },
});

beforeEach(() => {
  env.clear();
  for (const [key, value] of Object.entries(defaultEnv)) {
    env.set(key, value);
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
