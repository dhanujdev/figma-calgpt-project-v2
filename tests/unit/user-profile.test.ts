import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserProfile } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";

function setupProfileMock() {
  installMockSupabase({
    seed: {
      nutrition_goals: [
        {
          user_id: DEMO_USER_ID,
          calories: 2100,
          protein: 160,
          carbs: 210,
          fats: 70,
          goal_weight: 74,
          start_weight: 82,
          target_date: "2026-06-01",
        },
      ],
      user_preferences: [
        {
          user_id: DEMO_USER_ID,
          unit_weight: "kg",
          unit_energy: "kcal",
          language: "en",
          reminder_enabled: true,
          reminder_time: "19:30",
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
        {
          id: "meal-2",
          user_id: DEMO_USER_ID,
          logged_date: "2026-03-10",
          meal_name: "Chicken bowl",
          calories: 650,
          protein: 45,
          carbs: 50,
          fats: 18,
          consumed_at: "2026-03-10T12:00:00.000Z",
        },
        {
          id: "meal-3",
          user_id: DEMO_USER_ID,
          logged_date: "2026-03-09",
          meal_name: "Chicken bowl",
          calories: 620,
          protein: 42,
          carbs: 48,
          fats: 17,
          consumed_at: "2026-03-09T12:00:00.000Z",
        },
      ],
      daily_totals: [
        { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1800, total_protein: 135, total_carbs: 170, total_fats: 58, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 2000, total_protein: 145, total_carbs: 200, total_fats: 62, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1900, total_protein: 150, total_carbs: 190, total_fats: 60, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 2100, total_protein: 160, total_carbs: 205, total_fats: 68, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 1950, total_protein: 148, total_carbs: 198, total_fats: 59, meal_count: 2 },
        { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 2050, total_protein: 155, total_carbs: 202, total_fats: 64, meal_count: 3 },
        { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 500, total_protein: 35, total_carbs: 20, total_fats: 25, meal_count: 1 },
      ],
      weight_entries: [
        { user_id: DEMO_USER_ID, entry_date: "2026-03-05", weight: 82 },
        { user_id: DEMO_USER_ID, entry_date: TODAY, weight: 80.8 },
      ],
      badge_events: [],
      progress_photos: [],
      streak_events: [],
      agent_notes: [
        {
          user_id: DEMO_USER_ID,
          note_key: "allergy:peanuts",
          note_value: "Avoid peanuts in meal suggestions.",
          updated_at: "2026-03-11T09:00:00.000Z",
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("getUserProfile", () => {
  it("returns goals shape", async () => {
    setupProfileMock();
    const result = await getUserProfile({ range: "90D" });

    expect(result.success).toBe(true);
    expect(result.profile.goals).toMatchObject({
      calories: 2100,
      protein: 160,
      carbs: 210,
      fats: 70,
    });
  });

  it("returns preferences shape", async () => {
    setupProfileMock();
    const result = await getUserProfile();

    expect(result.profile.preferences).toMatchObject({
      unitWeight: "kg",
      unitEnergy: "kcal",
      language: "en",
      reminderEnabled: true,
    });
  });

  it("returns streak count", async () => {
    setupProfileMock();
    const result = await getUserProfile();

    expect(result.profile.trends.streak).toBeTypeOf("number");
  });

  it("returns recent meal count", async () => {
    setupProfileMock();
    const result = await getUserProfile();

    expect(result.profile.recentMealCount).toBe(2);
  });

  it("returns BMI", async () => {
    setupProfileMock();
    const result = await getUserProfile();

    expect(result.profile.trends.bmi).toMatchObject({
      value: expect.any(Number),
      status: expect.any(String),
    });
  });

  it("returns agent notes", async () => {
    setupProfileMock();
    const result = await getUserProfile();

    expect(result.profile.agentNotes).toEqual([
      {
        key: "allergy:peanuts",
        value: "Avoid peanuts in meal suggestions.",
        updatedAt: "2026-03-11T09:00:00.000Z",
      },
    ]);
  });

  it("handles a brand-new user with defaults", async () => {
    installMockSupabase({
      seed: {
        meals: [],
        daily_totals: [],
        weight_entries: [],
        badge_events: [],
        progress_photos: [],
        streak_events: [],
        agent_notes: [],
      },
    });

    const result = await getUserProfile();

    expect(result.success).toBe(true);
    expect(result.profile.goals).toMatchObject({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fats: 65,
    });
    expect(result.profile.agentNotes).toEqual([]);
    expect(result.profile.recentMealCount).toBe(0);
  });
});
