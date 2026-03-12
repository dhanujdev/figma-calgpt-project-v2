import type { VercelRequest, VercelResponse } from "@vercel/node";

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey, MCP-Protocol-Version",
  );
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

  const authorizationServer =
    process.env.OAUTH_AUTHORIZATION_SERVER ?? `${appOrigin}/.well-known/oauth-authorization-server`;

  return res.status(200).json({
    resource: `${appOrigin}/mcp`,
    authorization_servers: [authorizationServer],
    scopes_supported: ["calgpt.read", "calgpt.write"],
    bearer_methods_supported: ["header"],
    resource_name: "CalGPT V2 MCP",
  });
}
