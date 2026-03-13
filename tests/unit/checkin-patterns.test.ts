import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyCheckin } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";

function setupMock(dailyTotals: Array<Record<string, unknown>>) {
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
      meals: [],
      daily_totals: dailyTotals,
      weight_entries: [{ user_id: DEMO_USER_ID, entry_date: TODAY, weight: 79 }],
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

describe("runDailyCheckin patterns", () => {
  it("detects protein-under pattern", async () => {
    setupMock([
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1700, total_protein: 80, total_carbs: 180, total_fats: 55, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 1750, total_protein: 85, total_carbs: 180, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1800, total_protein: 70, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1650, total_protein: 75, total_carbs: 170, total_fats: 55, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1900, total_protein: 120, total_carbs: 195, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1850, total_protein: 95, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 900, total_protein: 50, total_carbs: 90, total_fats: 25, meal_count: 2 },
    ]);

    const result = await runDailyCheckin({ date: TODAY, range: "90D" });
    expect(result.checkin.observations.some((text) => text.includes("Protein"))).toBe(true);
  });

  it("detects skipped-meal pattern", async () => {
    setupMock([
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1700, total_protein: 120, total_carbs: 180, total_fats: 55, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 0, total_protein: 0, total_carbs: 0, total_fats: 0, meal_count: 0 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1800, total_protein: 120, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1650, total_protein: 115, total_carbs: 170, total_fats: 55, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1900, total_protein: 130, total_carbs: 195, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1850, total_protein: 125, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 900, total_protein: 50, total_carbs: 90, total_fats: 25, meal_count: 2 },
    ]);

    const result = await runDailyCheckin({ date: TODAY, range: "90D" });
    expect(result.checkin.observations.some((text) => text.includes("skipped logging meals"))).toBe(true);
  });

  it("detects over-eating trend", async () => {
    setupMock([
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 2300, total_protein: 120, total_carbs: 220, total_fats: 75, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 2250, total_protein: 125, total_carbs: 215, total_fats: 70, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1800, total_protein: 120, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 2400, total_protein: 130, total_carbs: 230, total_fats: 80, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1900, total_protein: 130, total_carbs: 195, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1850, total_protein: 125, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 2100, total_protein: 140, total_carbs: 200, total_fats: 70, meal_count: 3 },
    ]);

    const result = await runDailyCheckin({ date: TODAY, range: "90D" });
    expect(result.checkin.observations.some((text) => text.includes("Calories were above 110%"))).toBe(true);
  });

  it("returns generic advice when no patterns are found", async () => {
    setupMock([
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1900, total_protein: 120, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 1950, total_protein: 130, total_carbs: 195, total_fats: 62, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1800, total_protein: 125, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1850, total_protein: 120, total_carbs: 180, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1900, total_protein: 130, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1850, total_protein: 120, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 1300, total_protein: 120, total_carbs: 120, total_fats: 35, meal_count: 2 },
    ]);

    const result = await runDailyCheckin({ date: TODAY, range: "90D" });
    expect(result.checkin.observations).toEqual([]);
    expect(result.checkin.recommendations.some((text) => text.includes("tracking well today"))).toBe(true);
  });

  it("includes streak context in recommendations", async () => {
    setupMock([
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1900, total_protein: 120, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 1950, total_protein: 130, total_carbs: 195, total_fats: 62, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1800, total_protein: 125, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1850, total_protein: 120, total_carbs: 180, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1900, total_protein: 130, total_carbs: 190, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1850, total_protein: 120, total_carbs: 185, total_fats: 58, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 1300, total_protein: 120, total_carbs: 120, total_fats: 35, meal_count: 2 },
    ]);

    const result = await runDailyCheckin({ date: TODAY, range: "90D" });
    expect(result.checkin.recommendations.some((text) => text.includes("Current logging streak"))).toBe(true);
  });
});
