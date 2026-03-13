import { describe, expect, it } from "vitest";
import { __testables } from "../../supabase/functions/server/mcp_handler.tsx";

describe("clampPositive", () => {
  it("returns fallback for NaN input", () => {
    expect(__testables.clampPositive("abc", 12, 100)).toBe(12);
  });

  it("returns fallback for negative input", () => {
    expect(__testables.clampPositive(-4, 9, 100)).toBe(9);
  });

  it("clamps to max", () => {
    expect(__testables.clampPositive(999, 0, 250)).toBe(250);
  });

  it("passes through valid values", () => {
    expect(__testables.clampPositive(88, 0, 100)).toBe(88);
  });

  it("handles string-number coercion", () => {
    expect(__testables.clampPositive("42", 0, 100)).toBe(42);
  });
});

describe("sanitizeText", () => {
  it("strips angle brackets, quotes, and ampersands", () => {
    expect(__testables.sanitizeText(`<script>"a"&'b'`, 100)).toBe("scriptab");
  });

  it("truncates to maxLen", () => {
    expect(__testables.sanitizeText("abcdefgh", 5)).toBe("abcde");
  });

  it("handles null input", () => {
    expect(__testables.sanitizeText(null, 10)).toBe("");
  });

  it("handles undefined input", () => {
    expect(__testables.sanitizeText(undefined, 10)).toBe("");
  });

  it("preserves clean text", () => {
    expect(__testables.sanitizeText("chicken bowl", 30)).toBe("chicken bowl");
  });
});

describe("isValidIsoDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(__testables.isValidIsoDate("2026-03-12")).toBe(true);
  });

  it("rejects YYYY-M-D", () => {
    expect(__testables.isValidIsoDate("2026-3-2")).toBe(false);
  });

  it("rejects ISO timestamp", () => {
    expect(__testables.isValidIsoDate("2026-03-12T10:00:00.000Z")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(__testables.isValidIsoDate("")).toBe(false);
  });
});

describe("UUID_RE", () => {
  it("matches valid UUID", () => {
    expect(__testables.UUID_RE.test("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects partial UUID", () => {
    expect(__testables.UUID_RE.test("123e4567-e89b-12d3")).toBe(false);
  });

  it("rejects SQL injection strings", () => {
    expect(__testables.UUID_RE.test("x,user_id.neq.foo")).toBe(false);
  });
});

describe("LEGACY_ID_RE", () => {
  it("matches meal legacy IDs", () => {
    expect(__testables.LEGACY_ID_RE.test("meal_123456_abc123")).toBe(true);
  });

  it("rejects arbitrary strings", () => {
    expect(__testables.LEGACY_ID_RE.test("totally-not-a-meal")).toBe(false);
  });
});
