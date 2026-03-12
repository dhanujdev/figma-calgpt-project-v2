import type { VercelRequest, VercelResponse } from "@vercel/node";

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey, MCP-Protocol-Version",
  );
}

function buildAppOrigin(req: VercelRequest): string {
  const hostHeader = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as
    | string
    | string[];
  const protoHeader = (req.headers["x-forwarded-proto"] ?? "https") as
    | string
    | string[];
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const safeHost = host.split(",")[0].trim() || "figma-calgpt-project.vercel.app";
  return `${proto.split(",")[0].trim() || "https"}://${safeHost}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const appOrigin = buildAppOrigin(req);

  try {
    const rpcResponse = await fetch(`${appOrigin}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization
          ? { Authorization: String(req.headers.authorization) }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "sync_state",
          arguments: {},
        },
      }),
    });

    const rpcPayload = await rpcResponse.json();
    if (!rpcResponse.ok || rpcPayload?.error) {
      const message =
        rpcPayload?.error?.message ??
        rpcPayload?.result?.structuredContent?.error ??
        "sync_state failed";
      return res.status(502).json({ success: false, error: message });
    }

    const data = rpcPayload?.result?.structuredContent ?? null;
    if (!data) {
      return res.status(502).json({ success: false, error: "Missing structuredContent" });
    }

    return res.status(200).json({
      success: true,
      state: data,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: `State proxy failed: ${String(error)}`,
    });
  }
}
