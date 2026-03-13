import { describe, expect, it } from "vitest";
import { __testables } from "../../supabase/functions/server/mcp_handler.tsx";

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function jwtWithPayload(payload: Record<string, unknown>) {
  return `${encodeBase64Url({ alg: "none", typ: "JWT" })}.${encodeBase64Url(payload)}.signature`;
}

describe("Supabase OAuth auth helpers", () => {
  it("parses the Supabase OAuth client_id claim", () => {
    const claims = __testables.parseJwtClaims(
      jwtWithPayload({
        aud: "authenticated",
        client_id: "openai-connector-client",
      }),
    );

    expect(claims).toEqual({
      aud: ["authenticated"],
      scope: [],
      clientId: "openai-connector-client",
    });
  });

  it("accepts authenticated users even when Supabase omits scope claims", () => {
    expect(
      __testables.hasRequiredScope(
        {
          userId: "user-1",
          authenticated: true,
          tokenClaims: {
            aud: ["authenticated"],
            scope: [],
            clientId: "openai-connector-client",
          },
        },
        "openid",
      ),
    ).toBe(true);
  });

  it("accepts the default Supabase audience for MCP resource checks", () => {
    expect(
      __testables.hasExpectedAudience(
        {
          userId: "user-1",
          authenticated: true,
          tokenClaims: {
            aud: ["authenticated"],
            scope: [],
            clientId: "openai-connector-client",
          },
        },
        "https://figma-calgpt-project-v2.vercel.app/mcp",
      ),
    ).toBe(true);
  });
});
