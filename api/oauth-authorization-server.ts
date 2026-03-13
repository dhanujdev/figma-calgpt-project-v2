import type { VercelRequest, VercelResponse } from "@vercel/node";

const OAUTH_ENABLED = process.env.MCP_AUTH_MODE?.trim().toLowerCase() === "oauth";
const DEFAULT_SUPABASE_DISCOVERY_PATH = "/.well-known/oauth-authorization-server/auth/v1";
const OAUTH_SCOPES = ["openid", "email", "profile"];

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function fetchSupabaseDiscovery(supabaseUrl: string) {
  const response = await fetch(`${supabaseUrl}${DEFAULT_SUPABASE_DISCOVERY_PATH}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Supabase discovery request failed (${response.status})`);
  }

  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!OAUTH_ENABLED) {
    return res.status(404).json({ error: "Not Found" });
  }

  const hostHeader = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as
    | string
    | string[];
  const protoHeader = (req.headers["x-forwarded-proto"] ?? "https") as
    | string
    | string[];
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const safeHost = host.split(",")[0].trim() || "figma-calgpt-project-v2.vercel.app";
  const appOrigin = `${proto.split(",")[0].trim() || "https"}://${safeHost}`;

  // Use CalGPT's own OAuth proxy endpoints — bypasses Supabase Third-Party Auth
  // which requires session-linkage that standalone Google sign-in cannot satisfy.
  return res.status(200).json({
    issuer: appOrigin,
    authorization_endpoint: `${appOrigin}/api/oauth-authorize`,
    token_endpoint: `${appOrigin}/api/oauth-token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: OAUTH_SCOPES,
    code_challenge_methods_supported: ["S256"],
  });
}
