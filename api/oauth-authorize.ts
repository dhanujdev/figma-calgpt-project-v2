import type { VercelRequest, VercelResponse } from "@vercel/node";

// Lightweight OAuth 2.0 authorize endpoint.
// Stores the ChatGPT redirect_uri + state in a signed cookie, then redirects
// to Supabase's standard Google sign-in. After sign-in, Supabase redirects to
// /oauth/callback where a client-side page reads the tokens and redirects back
// to ChatGPT with a code.

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getOrigin(req: VercelRequest): string {
  const hostHeader = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string | string[];
  const protoHeader = (req.headers["x-forwarded-proto"] ?? "https") as string | string[];
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader).split(",")[0].trim();
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader).split(",")[0].trim();
  return `${proto || "https"}://${host || "figma-calgpt-project-v2.vercel.app"}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) return res.status(500).json({ error: "SUPABASE_URL not configured" });

  const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;
  if (!redirect_uri || !state) {
    return res.status(400).json({ error: "Missing redirect_uri or state" });
  }

  const origin = getOrigin(req);
  const callbackUrl = `${origin}/oauth/callback`;

  // Store the OAuth request params in a cookie so the callback page can use them
  const cookiePayload = Buffer.from(
    JSON.stringify({ redirect_uri, state, code_challenge, code_challenge_method })
  ).toString("base64url");

  res.setHeader(
    "Set-Cookie",
    `calgpt_oauth=${cookiePayload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`
  );

  // Redirect to Supabase Google sign-in with our callback as the redirect_to
  const supabaseSignInUrl =
    `${supabaseUrl}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(callbackUrl)}` +
    `&access_type=offline&prompt=consent`;

  return res.redirect(302, supabaseSignInUrl);
}
