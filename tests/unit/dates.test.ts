import { describe, expect, it, vi } from "vitest";
import { __testables } from "../../supabase/functions/server/mcp_handler.tsx";

describe("normalizeDate", () => {
  it("returns today for empty input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));

    expect(__testables.normalizeDate(undefined, "America/New_York")).toBe("2026-03-12");
  });

  it("passes through valid YYYY-MM-DD", () => {
    expect(__testables.normalizeDate("2026-04-01", "America/New_York")).toBe("2026-04-01");
  });

  it("converts Date strings to ISO date", () => {
    expect(__testables.normalizeDate("March 10, 2026 23:15:00 UTC", "America/New_York")).toBe("2026-03-10");
  });

  it("returns today for garbage input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));

    expect(__testables.normalizeDate("not-a-date", "America/New_York")).toBe("2026-03-12");
  });
});

describe("addDaysToIsoDate", () => {
  it("adds positive days", () => {
    expect(__testables.addDaysToIsoDate("2026-03-12", 5)).toBe("2026-03-17");
  });

  it("subtracts days", () => {
    expect(__testables.addDaysToIsoDate("2026-03-12", -7)).toBe("2026-03-05");
  });

  it("handles month and year boundaries", () => {
    expect(__testables.addDaysToIsoDate("2025-12-31", 1)).toBe("2026-01-01");
  });
});

describe("resolveTimeZone", () => {
  it("returns valid timezones as-is", () => {
    expect(__testables.resolveTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("falls back for invalid timezones", () => {
    expect(__testables.resolveTimeZone("Mars/Olympus")).toBe("America/New_York");
  });

  it("uses the default for empty input", () => {
    expect(__testables.resolveTimeZone("")).toBe("America/New_York");
  });
});
