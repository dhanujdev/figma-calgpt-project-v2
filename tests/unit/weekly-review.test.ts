import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWeeklyReview } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

function setupMock() {
  installMockSupabase({
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
          target_date: null,
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
        { user_id: DEMO_USER_ID, logged_date: "2026-03-09", consumed_at: "2026-03-10T01:30:00.000Z" },
        { user_id: DEMO_USER_ID, logged_date: "2026-03-11", consumed_at: "2026-03-12T02:15:00.000Z" },
      ],
      daily_totals: [
        { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 2300, total_protein: 80, total_carbs: 320, total_fats: 70, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 2300, total_protein: 85, total_carbs: 330, total_fats: 72, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 2300, total_protein: 90, total_carbs: 340, total_fats: 75, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1900, total_protein: 95, total_carbs: 180, total_fats: 60, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1800, total_protein: 100, total_carbs: 170, total_fats: 58, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 0, total_protein: 0, total_carbs: 0, total_fats: 0, meal_count: 0 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-12", total_calories: 2200, total_protein: 100, total_carbs: 260, total_fats: 68, meal_count: 3 },
      ],
      weight_entries: [
        { user_id: DEMO_USER_ID, entry_date: "2026-02-27", weight: 79.1 },
        { user_id: DEMO_USER_ID, entry_date: "2026-02-28", weight: 79.2 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-01", weight: 79.15 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-02", weight: 79.18 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-03", weight: 79.12 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-04", weight: 79.11 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-05", weight: 79.2 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-06", weight: 79.18 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-07", weight: 79.1 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-08", weight: 79.17 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-09", weight: 79.13 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-10", weight: 79.16 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-11", weight: 79.12 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-12", weight: 79.19 },
      ],
      progress_photos: [],
      streak_events: [],
      badge_events: [],
      agent_notes: [],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("runWeeklyReview proactive coaching", () => {
  it("returns patterns, an action plan, and goal projection", async () => {
    setupMock();
    const result = await runWeeklyReview();

    expect(result.success).toBe(true);
    expect(Array.isArray(result.review.patterns)).toBe(true);
    expect(Array.isArray(result.review.actionPlan)).toBe(true);
    expect(result.review.actionPlan.length).toBeGreaterThan(0);
    expect(result.review.goalProjection).toBeNull();
  });

  it("includes detected pattern codes in the review payload", async () => {
    setupMock();
    const result = await runWeeklyReview();
    const codes = result.review.patterns.map((pattern: { code: string }) => pattern.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "protein_deficit",
        "calorie_overconsumption",
        "skipped_meals",
        "late_night_eating",
        "weight_plateau",
        "macro_imbalance",
      ]),
    );
  });
});
