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
  incomingTimeZone?: string;
};

const SERVER_INFO = {
  name: "gpt-calories-mcp",
  version: "2.0.0",
};

const WIDGET_VERSION = "v13";
const WIDGET_URI = `ui://widget/gpt-calories-${WIDGET_VERSION}.html`;
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const OAUTH_SCOPES = ["openid", "email", "profile"] as const;
const NOAUTH_SCHEME = { type: "noauth" } as const;
const OAUTH2_SCHEME = {
  type: "oauth2",
  scopes: [...OAUTH_SCOPES],
} as const;
const AUTH_MODE = process.env.MCP_AUTH_MODE?.trim().toLowerCase() === "oauth" ? "oauth" : "noauth";
const OAUTH_ENABLED = AUTH_MODE === "oauth";
const DEFAULT_TIMEZONE = process.env.MCP_DEFAULT_TIMEZONE?.trim() || "America/New_York";
const TOOL_SECURITY_SCHEMES = OAUTH_ENABLED ? ([OAUTH2_SCHEME] as const) : ([NOAUTH_SCHEME] as const);

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

function buildFailureTelemetry(toolName: string, error: string, failureClass = "tool_error") {
  return {
    toolName,
    widgetVersion: WIDGET_VERSION,
    failureClass,
    error,
  };
}

const TOOL_DEFS: ToolDef[] = [
  {
    name: "log_meal",
    title: "Log meal",
    description:
      "Use this when the user asks you in chat to log a meal with calories/macros for today's record, including cases where you estimated the meal and want to save a short note about that estimate. Call it directly instead of announcing the tool call first, then reply with one concise confirmation and only the most important changed totals.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Meal name" },
        calories: { type: "number", description: "Calories" },
        protein: { type: "number", description: "Protein in grams" },
        carbs: { type: "number", description: "Carbs in grams" },
        fats: { type: "number", description: "Fats in grams" },
        estimation_notes: {
          type: "string",
          description: "Optional short note explaining an assistant estimate, assumption, or uncertainty about the meal.",
        },
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
      "Use this when the user asks to see their dashboard, progress, or settings, or when the assistant needs the latest daily totals, goals, preferences, progress, and onboarding state before replying. Call it directly without preamble, then keep the follow-up to a short orientation instead of repeating every visible value from the widget.",
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
    description: "Use this when the user asks you in chat to remove a logged meal by meal ID. Call it directly, then confirm the deleted meal and any important total change in one concise follow-up.",
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
      "Use this when the user asks you in chat to update calorie, macro, or weight target settings. This writes user goals, so call it directly and confirm the saved values clearly in one concise reply.",
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
    description: "Use this when the user asks you in chat to log a weight value so progress data is updated. Call it directly, then reply with the saved weight and only one or two relevant trend notes.",
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
      "Use this when the user asks you in chat to change units, language, reminder settings, theme, notifications, or height. This writes preferences, so call it directly and summarize only the saved changes explicitly.",
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
    name: "save_agent_note",
    title: "Save agent note",
    description:
      "Use this when you learn a durable user fact worth remembering across conversations, such as dietary restrictions, allergies, food preferences, exercise habits, or lifestyle patterns. Save only persistent details, not turn-by-turn summaries or temporary context.",
    inputSchema: {
      type: "object",
      properties: {
        note_key: {
          type: "string",
          description: 'Stable key, ideally category:detail such as "allergy:peanuts" or "preference:high-protein".',
        },
        note_value: {
          type: "string",
          description: "Short persistent fact to remember for future conversations.",
        },
      },
      required: ["note_key", "note_value"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Saving note...", "Note saved"),
  },
  {
    name: "get_user_profile",
    title: "Get user profile",
    description:
      "Use this at the start of a conversation or before making personalized coaching recommendations when you need the user's goals, preferences, trend summary, recent meal activity, saved persistent notes, and onboarding status in one call. If profile.isNewUser is true, guide them with concrete starter prompts instead of reciting sparse stats. Keep any summary short and focused on what the user should do next.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["7D", "14D", "30D", "90D", "6M", "1Y", "ALL"],
          description: "Optional analytics window for the embedded trend summary.",
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Loading profile...", "Profile ready"),
  },
  {
    name: "get_recent_meals",
    title: "Get recent meals",
    description:
      "Use this when you want the user's commonly logged recent meals across dates, especially for quick suggestions, repeat logging, or understanding their usual eating patterns.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of unique meals to return. Defaults to 20.",
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Loading recent meals...", "Recent meals ready"),
  },
  {
    name: "get_meal_suggestions",
    title: "Get meal suggestions",
    description:
      "Use this when the user asks what they should eat next and you want suggestions based on their remaining calorie and macro targets, while respecting durable preferences such as vegetarian notes when available.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Optional YYYY-MM-DD override for which day to evaluate remaining calories and macros.",
        },
        limit: {
          type: "number",
          description: "Maximum number of suggestions to return. Defaults to 3.",
        },
      },
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Planning meals...", "Meal suggestions ready"),
  },
  {
    name: "get_agent_notes",
    title: "Get agent notes",
    description:
      "Use this when you need the user's previously saved persistent notes, especially before making coaching suggestions that may depend on allergies, preferences, or recurring habits.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta("Loading notes...", "Notes ready"),
  },
  {
    name: "delete_agent_note",
    title: "Delete agent note",
    description:
      "Use this when the user explicitly wants a saved persistent fact removed or corrected by key, for example if an old dietary preference or allergy note is no longer accurate.",
    inputSchema: {
      type: "object",
      properties: {
        note_key: { type: "string", description: "Persistent note key to delete." },
      },
      required: ["note_key"],
      additionalProperties: false,
    },
    securitySchemes: TOOL_SECURITY_SCHEMES,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    _meta: toolMeta("Deleting note...", "Note deleted"),
  },
  {
    name: "upload_progress_photo",
    title: "Upload progress photo",
    description:
      "Use this when the user asks you in chat to attach a progress image URL for visual tracking history.",
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
      "Use this when the user asks for an end-of-day coaching summary, or when you want a quick proactive read on short-term nutrition patterns without modifying any data. Call it directly, then summarize the top signals and next step without narrating the tool use twice.",
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
      "Use this when the user asks for a structured weekly trend review, or when you want to proactively surface recurring patterns, plateau risk, streak milestones, and goal projection from logged data. Call it directly, then give one compact review summary and let the widget carry the detail.",
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
      "Use this when the user asks in chat for suggested goal updates before deciding whether to change goals. This tool does not write data; it returns recommendations only. Keep the follow-up focused on the recommendation, not a long narration of the call.",
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
      "Shows a read-only CalGPT dashboard with onboarding prompts, progress, settings, check-ins, weekly reviews, and clear last-update confirmations after agent actions. Users ask the agent in chat for all writes. When this widget renders, avoid restating every visible metric; prefer one concise takeaway plus the next best action.",
  };
}

type ActionSummary = {
  title: string;
  summary: string;
  detailLines?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeMealTotals(state: Record<string, unknown>) {
  const goals = asRecord(state.goals);
  const totalCalories = asNumber(state.totalCalories);
  const calorieGoal = goals ? asNumber(goals.calories) : null;
  const meals = Array.isArray(state.meals) ? state.meals.length : null;

  const parts: string[] = [];
  if (totalCalories != null && calorieGoal != null) {
    parts.push(`Today is ${Math.round(totalCalories)}/${Math.round(calorieGoal)} kcal.`);
  }
  if (meals != null) {
    parts.push(`${meals} meal${meals === 1 ? "" : "s"} logged.`);
  }
  return parts.join(" ");
}

function buildActionSummary(
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: Record<string, unknown>,
): ActionSummary | null {
  const state = asRecord(toolResult.state);
  const progress = asRecord(toolResult.progress);
  const preferences = asRecord(toolResult.preferences);

  if (toolName === "log_meal" && state) {
    const mealName = String(toolArgs.name ?? "Meal");
    const calories = asNumber(toolArgs.calories);
    const prefix = calories != null ? `${mealName} saved for ${Math.round(calories)} kcal.` : `${mealName} saved.`;
    return {
      title: "Meal saved",
      summary: [prefix, summarizeMealTotals(state)].filter(Boolean).join(" "),
    };
  }

  if (toolName === "delete_meal" && state) {
    return {
      title: "Meal removed",
      summary: [
        toolResult.deletedMealName
          ? `${String(toolResult.deletedMealName)} was removed.`
          : "The meal was deleted.",
        summarizeMealTotals(state),
      ].filter(Boolean).join(" "),
    };
  }

  if (toolName === "log_weight" && progress) {
    const currentWeight = asNumber(progress.currentWeight);
    const streak = asRecord(progress.streak);
    const currentStreak = streak ? asNumber(streak.current) : null;
    const bmi = asRecord(progress.bmi);
    const bmiValue = bmi ? asNumber(bmi.value) : null;
    const bmiStatus = bmi && typeof bmi.status === "string" ? bmi.status : null;
    const details = [];
    if (currentWeight != null) details.push(`Current weight ${currentWeight.toFixed(1)} kg`);
    if (currentStreak != null) details.push(`Streak ${Math.round(currentStreak)} day${currentStreak === 1 ? "" : "s"}`);
    if (bmiValue != null && bmiStatus) details.push(`BMI ${bmiValue.toFixed(1)} (${bmiStatus})`);
    return {
      title: "Weight saved",
      summary:
        currentWeight != null
          ? `Your latest weight is ${currentWeight.toFixed(1)} kg and progress has been refreshed.`
          : "Your latest weight was saved and progress has been refreshed.",
      detailLines: details,
    };
  }

  if (toolName === "update_goals" && state) {
    const goals = asRecord(state.goals);
    const details: string[] = [];
    if (goals) {
      if (toolArgs.calories != null && asNumber(goals.calories) != null) details.push(`Calories goal ${Math.round(Number(goals.calories))} kcal`);
      if (toolArgs.protein != null && asNumber(goals.protein) != null) details.push(`Protein goal ${Math.round(Number(goals.protein))} g`);
      if (toolArgs.carbs != null && asNumber(goals.carbs) != null) details.push(`Carbs goal ${Math.round(Number(goals.carbs))} g`);
      if (toolArgs.fats != null && asNumber(goals.fats) != null) details.push(`Fats goal ${Math.round(Number(goals.fats))} g`);
      if (toolArgs.goal_weight != null && asNumber(goals.goalWeight) != null) details.push(`Goal weight ${Number(goals.goalWeight).toFixed(1)} kg`);
      if (toolArgs.target_date != null && goals.targetDate) details.push(`Target date ${String(goals.targetDate)}`);
    }
    return {
      title: "Goals updated",
      summary: details.length > 0 ? "Your nutrition targets were saved." : "Your nutrition goals were saved.",
      detailLines: details,
    };
  }

  if (toolName === "update_preferences" && preferences) {
    const details: string[] = [];
    if (toolArgs.unit_weight != null && preferences.unit_weight) details.push(`Weight unit ${String(preferences.unit_weight)}`);
    if (toolArgs.unit_energy != null && preferences.unit_energy) details.push(`Energy unit ${String(preferences.unit_energy)}`);
    if (toolArgs.language != null && preferences.language) details.push(`Language ${String(preferences.language)}`);
    if (toolArgs.reminder_enabled != null) details.push(`Reminders ${preferences.reminder_enabled === false ? "off" : "on"}`);
    if (toolArgs.reminder_time != null && preferences.reminder_time) details.push(`Reminder time ${String(preferences.reminder_time)}`);
    if (toolArgs.theme_preset != null && preferences.theme_preset) details.push(`Theme ${String(preferences.theme_preset)}`);
    if (toolArgs.streak_badge_notifications != null) {
      details.push(`Badge notifications ${preferences.streak_badge_notifications === false ? "off" : "on"}`);
    }
    if (toolArgs.height_cm != null && preferences.height_cm != null) details.push(`Height ${Math.round(Number(preferences.height_cm))} cm`);
    return {
      title: "Preferences updated",
      summary: details.length > 0 ? "Your preferences were saved." : "Your preferences were updated.",
      detailLines: details,
    };
  }

  return null;
}

function toolStructuredContent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: Record<string, unknown>,
) {
  const actionSummary = buildActionSummary(toolName, toolArgs, toolResult);
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
      message: toolResult.message,
      actionSummary,
    };
  }
  if (toolResult.progress && typeof toolResult.progress === "object") {
    return {
      progress: toolResult.progress,
      success: toolResult.success,
      mode: toolResult.mode,
      message: toolResult.message,
      actionSummary,
    };
  }
  return {
    ...toolResult,
    actionSummary,
  };
}

export const __testables = {
  buildActionSummary,
  toolStructuredContent,
  authChallengeMeta,
  OAUTH_SCOPES,
};

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
  appOrigin: string,
  incomingAuthHeader?: string,
  incomingTimeZone?: string,
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

  if (incomingTimeZone) {
    headers["X-User-Timezone"] = incomingTimeZone;
  }
  headers["X-CalGPT-Resource"] = `${appOrigin}/mcp`;
  headers["X-CalGPT-Source"] = "mcp_gateway";
  headers["X-CalGPT-Widget-Version"] = WIDGET_VERSION;

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
      `Bearer resource_metadata=\"${resourceMetadataUrl}\", scope=\"${OAUTH_SCOPES.join(" ")}\", error=\"insufficient_scope\", error_description=\"Authentication required for this tool\"`,
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
          name: "GPT-Calories Widget v13",
          description: "Read-only nutrition, progress, onboarding, and coaching widget",
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
        context.appOrigin,
        context.incomingAuthHeader,
        context.incomingTimeZone,
      );

      if (toolResult.authRequired) {
        const authMeta = OAUTH_ENABLED ? authChallengeMeta(context) : null;
        return ok(id, {
          content: [{ type: "text", text: String(toolResult.error ?? "Authentication required") }],
          structuredContent: {
            success: false,
            error: String(toolResult.error ?? "Authentication required"),
            telemetry: buildFailureTelemetry(
              toolName,
              String(toolResult.error ?? "Authentication required"),
              String(toolResult.failureClass ?? "auth_required"),
            ),
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
        structuredContent: toolStructuredContent(toolName, toolArgs, toolResult),
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
          telemetry: buildFailureTelemetry(toolName, String(error), "gateway_call_failed"),
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
  const incomingTimeZoneHeader = (req.headers["x-user-timezone"] ??
    req.headers["x-timezone"] ??
    null) as string | string[] | null;
  const incomingTimeZone = Array.isArray(incomingTimeZoneHeader)
    ? incomingTimeZoneHeader[0]
    : incomingTimeZoneHeader;

  const context: RpcContext = {
    appOrigin,
    supabaseUrl: process.env.SUPABASE_URL,
    incomingAuthHeader: incomingAuth,
    incomingTimeZone: incomingTimeZone?.trim() || DEFAULT_TIMEZONE,
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
