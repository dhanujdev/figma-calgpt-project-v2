import type { VercelRequest, VercelResponse } from "@vercel/node";

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const hostHeader = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as
    | string
    | string[];
  const protoHeader = (req.headers["x-forwarded-proto"] ?? "https") as
    | string
    | string[];
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const safeHost = host.split(",")[0].trim() || "figma-calgpt-project.vercel.app";
  const appOrigin = `${proto.split(",")[0].trim() || "https"}://${safeHost}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const defaultIssuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : appOrigin;

  return res.status(200).json({
    issuer: process.env.OAUTH_AUTHORIZATION_SERVER ?? defaultIssuer,
    authorization_endpoint:
      process.env.OAUTH_AUTHORIZATION_ENDPOINT ??
      (supabaseUrl ? `${supabaseUrl}/auth/v1/authorize` : `${appOrigin}/oauth/authorize`),
    token_endpoint:
      process.env.OAUTH_TOKEN_ENDPOINT ??
      (supabaseUrl ? `${supabaseUrl}/auth/v1/token` : `${appOrigin}/oauth/token`),
    registration_endpoint:
      process.env.OAUTH_REGISTRATION_ENDPOINT ??
      (supabaseUrl ? `${supabaseUrl}/auth/v1/signup` : `${appOrigin}/oauth/register`),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["calgpt.read", "calgpt.write"],
    code_challenge_methods_supported: ["S256"],
  });
}
