import { Hono, type Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as mcpHandler from "./mcp_handler.tsx";
import { logEvent } from "./logging.ts";

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Authorization", "X-CalGPT-Resource", "X-CalGPT-Source", "X-CalGPT-Widget-Version", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const path = new URL(c.req.url).pathname;
  c.set("requestId", requestId);

  try {
    await next();
  } catch (error) {
    logEvent("error", "request.failed", {
      requestId,
      method: c.req.method,
      path,
      durationMs: Date.now() - startedAt,
      status: c.res.status || 500,
      error,
    });
    throw error;
  }

  logEvent("info", "request.completed", {
    requestId,
    method: c.req.method,
    path,
    durationMs: Date.now() - startedAt,
    status: c.res.status,
    resource: c.req.header("x-calgpt-resource"),
    source: c.req.header("x-calgpt-source"),
    widgetVersion: c.req.header("x-calgpt-widget-version"),
  });
});

function requestContext(c: { req: { header: (key: string) => string | undefined } }) {
  const authHeader = c.req.header("x-user-authorization") ?? c.req.header("authorization");
  const timeZone = c.req.header("x-user-timezone") ?? c.req.header("x-timezone");
  const resource = c.req.header("x-calgpt-resource");
  const source = c.req.header("x-calgpt-source");
  const widgetVersion = c.req.header("x-calgpt-widget-version");
  return { authHeader, timeZone, resource, source, widgetVersion };
}

function responseStatus(result: { success?: boolean; failureClass?: string }, defaultFailureStatus = 400) {
  if (result?.success) return 200;
  if (result?.failureClass === "rate_limited") return 429;
  return defaultFailureStatus;
}

async function handleMcp(c: Context) {
  try {
    const body = await c.req.json();
    const { method, params } = body;
    const ctx = requestContext(c);

    let result;
    switch (method) {
      case "log_meal":
        result = await mcpHandler.logMeal(params ?? {}, ctx);
        break;
      case "sync_state":
        result = await mcpHandler.syncState(params ?? {}, ctx);
        break;
      case "delete_meal":
        result = await mcpHandler.deleteMeal(params ?? {}, ctx);
        break;
      case "update_goals":
        result = await mcpHandler.updateGoals(params ?? {}, ctx);
        break;
      case "log_weight":
        result = await mcpHandler.logWeight(params ?? {}, ctx);
        break;
      case "get_progress":
        result = await mcpHandler.getProgress(params ?? {}, ctx);
        break;
      case "update_preferences":
        result = await mcpHandler.updatePreferences(params ?? {}, ctx);
        break;
      case "save_agent_note":
        result = await mcpHandler.saveAgentNote(params ?? {}, ctx);
        break;
      case "get_user_profile":
        result = await mcpHandler.getUserProfile(params ?? {}, ctx);
        break;
      case "get_recent_meals":
        result = await mcpHandler.getRecentMeals(params ?? {}, ctx);
        break;
      case "get_meal_suggestions":
        result = await mcpHandler.getMealSuggestions(params ?? {}, ctx);
        break;
      case "get_agent_notes":
        result = await mcpHandler.getAgentNotes(params ?? {}, ctx);
        break;
      case "delete_agent_note":
        result = await mcpHandler.deleteAgentNote(params ?? {}, ctx);
        break;
      case "upload_progress_photo":
        result = await mcpHandler.uploadProgressPhoto(params ?? {}, ctx);
        break;
      case "run_daily_checkin":
        result = await mcpHandler.runDailyCheckin(params ?? {}, ctx);
        break;
      case "run_weekly_review":
        result = await mcpHandler.runWeeklyReview(params ?? {}, ctx);
        break;
      case "suggest_goal_adjustments":
        result = await mcpHandler.suggestGoalAdjustments(params ?? {}, ctx);
        break;
      default:
        logEvent("warn", "mcp.unknown_method", {
          requestId: c.get("requestId"),
          method,
          source: ctx.source ?? null,
          widgetVersion: ctx.widgetVersion ?? null,
        });
        return c.json({ success: false, error: `Unknown method: ${method}` }, 400);
    }

    return c.json(result);
  } catch (error) {
    logEvent("error", "mcp.request_failed", {
      requestId: c.get("requestId"),
      path: new URL(c.req.url).pathname,
      error,
    });
    return c.json({ success: false, error: String(error) }, 500);
  }
}

const routePrefixes = ["", "/make-server-ae24ed01", "/server"];

for (const prefix of routePrefixes) {
  app.get(`${prefix}/health`, (c) => c.json({ status: "ok" }));

  app.post(`${prefix}/mcp`, async (c) => handleMcp(c));

  app.get(`${prefix}/state`, async (c) => {
    const result = await mcpHandler.syncState({}, requestContext(c));
    return c.json(result);
  });

  app.post(`${prefix}/log-meal`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.logMeal(params, requestContext(c));
    return c.json(result, responseStatus(result, 400));
  });

  app.delete(`${prefix}/meal/:id`, async (c) => {
    const meal_id = c.req.param("id");
    const result = await mcpHandler.deleteMeal({ meal_id }, requestContext(c));
    return c.json(result, responseStatus(result, 404));
  });

  app.post(`${prefix}/goals`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.updateGoals(params, requestContext(c));
    return c.json(result, responseStatus(result, 400));
  });

  app.post(`${prefix}/weight`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.logWeight(params, requestContext(c));
    return c.json(result, responseStatus(result, 400));
  });

  app.get(`${prefix}/progress`, async (c) => {
    const range = c.req.query("range") ?? "90D";
    const result = await mcpHandler.getProgress({ range }, requestContext(c));
    return c.json(result, result.success ? 200 : 400);
  });

  app.post(`${prefix}/preferences`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.updatePreferences(params, requestContext(c));
    return c.json(result, responseStatus(result, 400));
  });
}

Deno.serve(app.fetch);
