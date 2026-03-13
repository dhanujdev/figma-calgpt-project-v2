import type { VercelRequest, VercelResponse } from "@vercel/node";

// OAuth 2.0 token endpoint.
// ChatGPT sends the "code" which is a base64url-encoded bundle of
// {access_token, refresh_token} created by the /oauth/callback page.
// We decode it and return the Supabase access_token as the OAuth token.

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const body = req.body as Record<string, string> | undefined;
  const code = body?.code ?? (req.query.code as string | undefined);

  if (!code) {
    return res.status(400).json({ error: "invalid_request", error_description: "Missing code" });
  }

  try {
    const decoded = Buffer.from(code, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as { at?: string; rt?: string };

    if (!payload.at) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Invalid code" });
    }

    return res.status(200).json({
      access_token: payload.at,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: payload.rt ?? undefined,
    });
  } catch {
    return res.status(400).json({ error: "invalid_grant", error_description: "Malformed code" });
  }
}
