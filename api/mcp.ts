import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "fs";
import path from "path";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

type RpcContext = {
  appOrigin: string;
  supabaseUrl?: string;
  incomingAuthHeader?: string;
};

const SERVER_INFO = {
  name: "gpt-calories-mcp",
  version: "2.0.0",
};

const WIDGET_URI = "ui://widget/gpt-calories-v4.html";
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const NOAUTH_SCHEME = { type: "noauth" } as const;
const OAUTH2_SCHEME = {
  type: "oauth2",
  scopes: ["calgpt.read", "calgpt.write"],
} as const;
const AUTH_MODE = process.env.MCP_AUTH_MODE?.trim().toLowerCase() === "oauth" ? "oauth" : "noauth";
const OAUTH_ENABLED = AUTH_MODE === "oauth";
const TOOL_SECURITY_SCHEMES = OAUTH_ENABLED
  ? ([NOAUTH_SCHEME, OAUTH2_SCHEME] as const)
  : ([NOAUTH_SCHEME] as const);

const SHARED_UI_META = {
  ui: {
    resourceUri: WIDGET_URI,
    visibility: ["model", "app"],
  },
  "openai/outputTemplate": WIDGET_URI,
};

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  securitySchemes: ReadonlyArray<(typeof TOOL_SECURITY_SCHEMES)[number]>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
  _meta: Record<string, unknown>;
};

function toolMeta(invoking: string, invoked: string) {
  return {
    securitySchemes: TOOL_SECURITY_SCHEMES,
    ...SHARED_UI_META,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

const TOOL_DEFS: ToolDef[] = [
  {
    name: "log_meal",
    title: "Log meal",
    description:
      "Use this when the user reports a meal and calories/macros that should be added to today's log.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Meal name" },
        calories: { type: "number", description: "Calories" },
        protein: { type: "number", description: "Protein in grams" },
        carbs: { type: "number", description: "Carbs in grams" },
        fats: { type: "number", description: "Fats in grams" },
        date: { type: "string", description: "Optional YYYY-MM-DD override" },
      },
      required: ["name", "calories"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Logging meal...", "Meal logged"),
  },
  {
    name: "sync_state",
    title: "Sync state",
    description:
      "Use this when the assistant needs the latest daily totals, goals, preferences, and progress payload.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Optional YYYY-MM-DD" },
        range: {
          type: "string",
          enum: ["7D", "14D", "30D", "90D", "6M", "1Y", "ALL"],
          description: "Progress window",
        },
        page: {
          type: "string",
          enum: ["home", "progress", "settings"],
          description: "UI hint for the widget",
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Syncing state...", "State synced"),
  },
  {
    name: "delete_meal",
    title: "Delete meal",
    description: "Use this when a logged meal should be removed by meal ID.",
    inputSchema: {
      type: "object",
      properties: {
        meal_id: { type: "string", description: "Meal ID to delete" },
        date: { type: "string", description: "Optional YYYY-MM-DD" },
      },
      required: ["meal_id"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    _meta: toolMeta("Deleting meal...", "Meal deleted"),
  },
  {
    name: "update_goals",
    title: "Update goals",
    description:
      "Use this when the user asks to update calorie/macro or weight target settings. This writes user goals.",
    inputSchema: {
      type: "object",
      properties: {
        calories: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fats: { type: "number" },
        goal_weight: { type: "number" },
        start_weight: { type: "number" },
        target_date: { type: "string" },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Updating goals...", "Goals updated"),
  },
  {
    name: "log_weight",
    title: "Log weight",
    description: "Use this when the user shares a weight value and wants progress updated.",
    inputSchema: {
      type: "object",
      properties: {
        weight: { type: "number", description: "Weight value" },
        date: { type: "string", description: "Optional YYYY-MM-DD" },
        range: {
          type: "string",
          enum: ["7D", "14D", "30D", "90D", "6M", "1Y", "ALL"],
        },
      },
      required: ["weight"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Logging weight...", "Weight logged"),
  },
  {
    name: "get_progress",
    title: "Get progress",
    description:
      "Use this when the assistant needs chart-ready analytics for progress, BMI, streak, and weekly energy.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["7D", "14D", "30D", "90D", "6M", "1Y", "ALL"],
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Building progress...", "Progress ready"),
  },
  {
    name: "update_preferences",
    title: "Update preferences",
    description:
      "Use this when the user changes units, language, reminder settings, theme, notifications, or height.",
    inputSchema: {
      type: "object",
      properties: {
        unit_weight: { type: "string", enum: ["kg", "lb"] },
        unit_energy: { type: "string", enum: ["kcal", "kj"] },
        language: { type: "string" },
        reminder_enabled: { type: "boolean" },
        reminder_time: { type: "string" },
        theme_preset: { type: "string" },
        streak_badge_notifications: { type: "boolean" },
        height_cm: { type: "number" },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Saving preferences...", "Preferences saved"),
  },
  {
    name: "upload_progress_photo",
    title: "Upload progress photo",
    description:
      "Use this when the user wants to attach a progress image URL for visual tracking history.",
    inputSchema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "Public image URL" },
        note: { type: "string" },
      },
      required: ["image_url"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Saving progress photo...", "Photo saved"),
  },
  {
    name: "run_daily_checkin",
    title: "Run daily check-in",
    description:
      "Use this when the user asks for a daily coaching summary and recommendations without modifying data.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string" },
        range: {
          type: "string",
          enum: ["7D", "14D", "30D", "90D", "6M", "1Y", "ALL"],
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Running check-in...", "Check-in ready"),
  },
  {
    name: "run_weekly_review",
    title: "Run weekly review",
    description:
      "Use this when the user asks for a structured weekly trend review based on logged data.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Reviewing week...", "Weekly review ready"),
  },
  {
    name: "suggest_goal_adjustments",
    title: "Suggest goal adjustments",
    description:
      "Use this when the user wants suggested goal updates. This tool does not write data; it returns recommendations only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Computing suggestions...", "Suggestions ready"),
  },
];

function getWidgetHtml(): string {
  const candidates = [
    path.join(process.cwd(), "public", "component.html"),
    path.join(process.cwd(), "dist", "component.html"),
  ];

  for (const filePath of candidates) {
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      // Try next location.
    }
  }

  return [
    "<!DOCTYPE html>",
    "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>",
    "<title>CalGPT V2 Widget</title></head>",
    "<body><pre id='root'>Loading...</pre>",
    "<script>",
    "function render(){const out=window.openai?.toolOutput||null;document.getElementById('root').textContent=JSON.stringify(out,null,2)}",
    "window.addEventListener('openai:set_globals',render,{passive:true});render();",
    "</script></body></html>",
  ].join("");
}

function widgetResourceMeta(context: RpcContext) {
  const connectDomains = new Set<string>([context.appOrigin]);
  if (context.supabaseUrl) {
    connectDomains.add(context.supabaseUrl);
  }
  const connectDomainList = Array.from(connectDomains);
  const resourceDomainList = ["https://*.oaistatic.com", context.appOrigin];

  return {
    ui: {
      prefersBorder: true,
      domain: context.appOrigin,
      csp: {
        connectDomains: connectDomainList,
        resourceDomains: resourceDomainList,
      },
    },
    "openai/widgetPrefersBorder": true,
    "openai/widgetDomain": context.appOrigin,
    "openai/widgetCSP": {
      connect_domains: connectDomainList,
      resource_domains: resourceDomainList,
    },
    "openai/widgetDescription":
      "Shows calories, macros, progress analytics, goals, and settings from GPT-Calories.",
  };
}

function toolStructuredContent(toolResult: Record<string, unknown>) {
  if (toolResult.state && typeof toolResult.state === "object") {
    return {
      ...(toolResult.state as Record<string, unknown>),
      progress: toolResult.progress,
      checkin: toolResult.checkin,
      review: toolResult.review,
      suggestion: toolResult.suggestion,
      preferences: toolResult.preferences,
      mode: toolResult.mode,
      success: toolResult.success,
    };
  }
  if (toolResult.progress && typeof toolResult.progress === "object") {
    return {
      progress: toolResult.progress,
      success: toolResult.success,
      mode: toolResult.mode,
    };
  }
  return toolResult;
}

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey, MCP-Protocol-Version",
  );
}

function ok(id: JsonRpcId, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function err(id: JsonRpcId, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

function parseBody(req: VercelRequest): JsonRpcRequest | JsonRpcRequest[] {
  if (req.body === undefined || req.body === null) {
    throw new Error("Missing request body");
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body as JsonRpcRequest | JsonRpcRequest[];
}

async function callSupabaseTool(
  name: string,
  args: Record<string, unknown>,
  incomingAuthHeader?: string,
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not configured");
  }

  const configuredEndpoint = process.env.SUPABASE_MCP_ENDPOINT?.trim();
  const configuredFunction = process.env.SUPABASE_FUNCTION_NAME?.trim() || "make-server-ae24ed01";
  const endpointCandidates = configuredEndpoint
    ? [configuredEndpoint]
    : [
        `${supabaseUrl}/functions/v1/${configuredFunction}/mcp`,
        `${supabaseUrl}/functions/v1/${configuredFunction}/make-server-ae24ed01/mcp`,
        `${supabaseUrl}/functions/v1/server/mcp`,
        `${supabaseUrl}/functions/v1/server/make-server-ae24ed01/mcp`,
      ];
  const endpoints = Array.from(new Set(endpointCandidates));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey,
  };

  if (incomingAuthHeader) {
    headers["X-User-Authorization"] = incomingAuthHeader;
  }

  let lastError = "Supabase function call failed";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          method: name,
          params: args,
        }),
      });

      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { success: false, error: text };
      }

      if (response.ok) {
        return payload as {
          success?: boolean;
          message?: string;
          error?: string;
          authRequired?: boolean;
          [key: string]: unknown;
        };
      }

      const reason =
        (payload as { error?: string })?.error ??
        `Supabase function failed (${response.status})`;
      lastError = `${reason} [endpoint=${endpoint}]`;

      const retryable =
        response.status === 404 || /Unknown method:/i.test(String(reason));
      if (!retryable) {
        throw new Error(lastError);
      }
    } catch (error) {
      lastError = `${String(error)} [endpoint=${endpoint}]`;
    }
  }

  throw new Error(lastError);
}

function authChallengeMeta(context: RpcContext) {
  const resourceMetadataUrl = `${context.appOrigin}/.well-known/oauth-protected-resource`;
  return {
    "mcp/www_authenticate": [
      `Bearer resource_metadata=\"${resourceMetadataUrl}\", error=\"insufficient_scope\", error_description=\"Authentication required for this tool\"`,
    ],
  };
}

async function handleSingleRpc(rpc: JsonRpcRequest, context: RpcContext) {
  const id = rpc.id ?? null;
  const method = rpc.method;
  const params = (rpc.params ?? {}) as Record<string, unknown>;

  if (!method) {
    return err(id, -32600, "Invalid Request");
  }

  if (rpc.id === undefined && method.startsWith("notifications/")) {
    return null;
  }

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: {
          listChanged: false,
        },
        resources: {
          subscribe: false,
          listChanged: false,
        },
      },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "ping") {
    return ok(id, {});
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOL_DEFS });
  }

  if (method === "resources/list") {
    return ok(id, {
      resources: [
        {
          uri: WIDGET_URI,
          name: "GPT-Calories Widget v4",
          description: "Interactive nutrition, progress, and settings widget",
          mimeType: WIDGET_MIME_TYPE,
        },
      ],
    });
  }

  if (method === "resources/read") {
    const uri = params.uri as string | undefined;
    if (!uri) {
      return err(id, -32602, "Missing resource uri");
    }
    if (uri !== WIDGET_URI) {
      return err(id, -32602, `Unknown resource uri: ${uri}`);
    }

    return ok(id, {
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: WIDGET_MIME_TYPE,
          text: getWidgetHtml(),
          _meta: widgetResourceMeta(context),
        },
      ],
    });
  }

  if (method === "tools/call") {
    const toolName = params.name as string | undefined;
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

    if (!toolName) {
      return err(id, -32602, "Missing tool name");
    }

    const toolDef = TOOL_DEFS.find((tool) => tool.name === toolName);
    if (!toolDef) {
      return err(id, -32601, `Unknown tool: ${toolName}`);
    }

    try {
      const toolResult = await callSupabaseTool(
        toolName,
        toolArgs,
        context.incomingAuthHeader,
      );

      if (toolResult.authRequired) {
        const authMeta = OAUTH_ENABLED ? authChallengeMeta(context) : null;
        return ok(id, {
          content: [{ type: "text", text: String(toolResult.error ?? "Authentication required") }],
          structuredContent: {
            success: false,
            error: String(toolResult.error ?? "Authentication required"),
          },
          ...(authMeta ? { _meta: authMeta } : {}),
          isError: true,
        });
      }

      const isError = toolResult.success === false;
      const message =
        toolResult.message ??
        (isError ? toolResult.error ?? "Tool call failed" : `${toolName} completed`);

      return ok(id, {
        content: [{ type: "text", text: String(message) }],
        structuredContent: toolStructuredContent(toolResult),
        _meta: {
          rawResult: toolResult,
        },
        isError,
      });
    } catch (error) {
      return ok(id, {
        content: [
          {
            type: "text",
            text: `Tool call failed: ${String(error)}`,
          },
        ],
        structuredContent: {
          success: false,
          error: String(error),
        },
        isError: true,
      });
    }
  }

  return err(id, -32601, `Method not found: ${method}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

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

  const incomingAuth = (req.headers["authorization"] ?? null) as string | null;

  const context: RpcContext = {
    appOrigin,
    supabaseUrl: process.env.SUPABASE_URL,
    incomingAuthHeader: incomingAuth,
  };

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "/api/mcp",
      widgetResourceUri: WIDGET_URI,
      message: "MCP endpoint is up. Use POST with JSON-RPC body.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = parseBody(req);
    if (Array.isArray(body)) {
      const responses = await Promise.all(body.map((rpc) => handleSingleRpc(rpc, context)));
      const filtered = responses.filter((response) => response !== null);
      if (filtered.length === 0) {
        return res.status(204).end();
      }
      return res.status(200).json(filtered);
    }

    const response = await handleSingleRpc(body, context);
    if (response === null) {
      return res.status(204).end();
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(400).json(err(null, -32700, `Parse error: ${String(error)}`));
  }
}
