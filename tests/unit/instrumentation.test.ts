import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  logMeal,
  logWeight,
  runDailyCheckin,
  runWeeklyReview,
  syncState,
  updateGoals,
  updatePreferences,
} from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";

function setupMock() {
  return installMockSupabase({
    seed: {
      nutrition_goals: [
        {
          user_id: DEMO_USER_ID,
          calories: 2000,
          protein: 150,
          carbs: 200,
          fats: 65,
          goal_weight: 75,
          start_weight: 80,
          target_date: "2026-06-01",
        },
      ],
      user_preferences: [
        {
          user_id: DEMO_USER_ID,
          unit_weight: "kg",
          unit_energy: "kcal",
          language: "en",
          reminder_enabled: false,
          reminder_time: "20:00",
          theme_preset: "midnight",
          streak_badge_notifications: true,
          height_cm: 180,
        },
      ],
      meals: [
        {
          id: "meal-1",
          user_id: DEMO_USER_ID,
          logged_date: TODAY,
          meal_name: "Egg scramble",
          calories: 500,
          protein: 35,
          carbs: 20,
          fats: 25,
          consumed_at: `${TODAY}T08:00:00.000Z`,
        },
      ],
      daily_totals: [
        {
          user_id: DEMO_USER_ID,
          entry_date: TODAY,
          total_calories: 500,
          total_protein: 35,
          total_carbs: 20,
          total_fats: 25,
          meal_count: 1,
        },
      ],
      weight_entries: [
        { user_id: DEMO_USER_ID, entry_date: "2026-03-10", weight: 80.4 },
        { user_id: DEMO_USER_ID, entry_date: TODAY, weight: 79.8 },
      ],
      badge_events: [],
      progress_photos: [],
      streak_events: [],
      agent_notes: [],
      analytics_events: [],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("write-path summaries and instrumentation", () => {
  it("records dashboard_open when syncing the home page", async () => {
    const client = setupMock();

    await syncState({ page: "home", date: TODAY, range: "90D" }, { source: "mcp_gateway", widgetVersion: "v12" });

    expect(client.__tables.analytics_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: "dashboard_open",
          tool_name: "sync_state",
          source: "mcp_gateway",
          widget_version: "v12",
        }),
      ]),
    );
  });

  it("records meal and weight funnel events and returns concise summaries", async () => {
    const client = setupMock();

    const mealResult = await logMeal(
      { name: "Greek yogurt bowl", calories: 350, protein: 20, carbs: 30, fats: 8, date: TODAY },
      { source: "mcp_gateway", widgetVersion: "v12" },
    );
    const weightResult = await logWeight(
      { weight: 79.4, date: TODAY, range: "90D" },
      { source: "mcp_gateway", widgetVersion: "v12" },
    );

    expect(mealResult.message).toContain("Logged Greek yogurt bowl.");
    expect(mealResult.message).toContain("Today is");
    expect(weightResult.message).toContain("Saved 79.4 kg for 2026-03-12.");
    expect(weightResult.message).toContain("Current streak is");
    expect(client.__tables.analytics_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_name: "meal_logged", tool_name: "log_meal" }),
        expect.objectContaining({ event_name: "weight_logged", tool_name: "log_weight" }),
      ]),
    );
  });

  it("records coaching funnel events", async () => {
    const client = setupMock();

    await runDailyCheckin({ date: TODAY, range: "90D" }, { source: "mcp_gateway", widgetVersion: "v12" });
    await runWeeklyReview({}, { source: "mcp_gateway", widgetVersion: "v12" });

    expect(client.__tables.analytics_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_name: "daily_checkin_run", tool_name: "run_daily_checkin" }),
        expect.objectContaining({ event_name: "weekly_review_run", tool_name: "run_weekly_review" }),
      ]),
    );
  });

  it("returns explicit saved-change summaries for goals and preferences", async () => {
    setupMock();

    const goalsResult = await updateGoals(
      { calories: 2200, protein: 165, target_date: "2026-07-01", date: TODAY },
      { source: "mcp_gateway", widgetVersion: "v12" },
    );
    const preferencesResult = await updatePreferences(
      { unit_weight: "lb", reminder_enabled: true, reminder_time: "19:30", theme_preset: "sand" },
      { source: "mcp_gateway", widgetVersion: "v12" },
    );

    expect(goalsResult.message).toBe("Saved goals: calories 2200 kcal, protein 165 g, target date 2026-07-01.");
    expect(preferencesResult.message).toBe(
      "Saved preferences: weight unit lb, reminders on, reminder time 19:30, theme sand.",
    );
  });
});
