import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as mcpHandler from "./mcp_handler.tsx";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

function requestContext(c: { req: { header: (key: string) => string | undefined } }) {
  const authHeader = c.req.header("x-user-authorization") ?? c.req.header("authorization");
  return { authHeader };
}

async function handleMcp(c: any) {
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
        return c.json({ success: false, error: `Unknown method: ${method}` }, 400);
    }

    return c.json(result);
  } catch (error) {
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
    return c.json(result, result.success ? 200 : 400);
  });

  app.delete(`${prefix}/meal/:id`, async (c) => {
    const meal_id = c.req.param("id");
    const result = await mcpHandler.deleteMeal({ meal_id }, requestContext(c));
    return c.json(result, result.success ? 200 : 404);
  });

  app.post(`${prefix}/goals`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.updateGoals(params, requestContext(c));
    return c.json(result, result.success ? 200 : 400);
  });

  app.post(`${prefix}/weight`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.logWeight(params, requestContext(c));
    return c.json(result, result.success ? 200 : 400);
  });

  app.get(`${prefix}/progress`, async (c) => {
    const range = c.req.query("range") ?? "90D";
    const result = await mcpHandler.getProgress({ range }, requestContext(c));
    return c.json(result, result.success ? 200 : 400);
  });

  app.post(`${prefix}/preferences`, async (c) => {
    const params = await c.req.json();
    const result = await mcpHandler.updatePreferences(params, requestContext(c));
    return c.json(result, result.success ? 200 : 400);
  });
}

Deno.serve(app.fetch);
