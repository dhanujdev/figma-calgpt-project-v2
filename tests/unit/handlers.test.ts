import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteMeal,
  getProgress,
  logMeal,
  logWeight,
  runDailyCheckin,
  runWeeklyReview,
  suggestGoalAdjustments,
  syncState,
  updateGoals,
  updatePreferences,
} from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";
const UUID_MEAL_ID = "11111111-1111-1111-1111-111111111111";
const LEGACY_MEAL_ID = "meal_123456_abc123";

function baseSeed() {
  return {
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
      {
        id: UUID_MEAL_ID,
        user_id: DEMO_USER_ID,
        logged_date: TODAY,
        legacy_meal_id: null,
        meal_name: "Oats",
        calories: 450,
        protein: 25,
        carbs: 50,
        fats: 12,
        consumed_at: `${TODAY}T08:00:00.000Z`,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        user_id: DEMO_USER_ID,
        logged_date: TODAY,
        legacy_meal_id: LEGACY_MEAL_ID,
        meal_name: "Salad",
        calories: 300,
        protein: 20,
        carbs: 20,
        fats: 10,
        consumed_at: `${TODAY}T12:00:00.000Z`,
      },
    ],
    daily_totals: [
      { user_id: DEMO_USER_ID, entry_date: "2026-03-06", total_calories: 1800, total_protein: 130, total_carbs: 180, total_fats: 60, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-07", total_calories: 2100, total_protein: 145, total_carbs: 200, total_fats: 68, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-08", total_calories: 1650, total_protein: 120, total_carbs: 170, total_fats: 55, meal_count: 2 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-09", total_calories: 1900, total_protein: 150, total_carbs: 190, total_fats: 61, meal_count: 3 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-10", total_calories: 2200, total_protein: 160, total_carbs: 215, total_fats: 70, meal_count: 4 },
      { user_id: DEMO_USER_ID, entry_date: "2026-03-11", total_calories: 1750, total_protein: 118, total_carbs: 175, total_fats: 58, meal_count: 2 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, total_calories: 750, total_protein: 45, total_carbs: 70, total_fats: 22, meal_count: 2 },
    ],
    streak_events: [],
    badge_events: [
      {
        user_id: DEMO_USER_ID,
        badge_code: "starter",
        awarded_at: "2026-03-01T12:00:00.000Z",
      },
    ],
    weight_entries: [
      { user_id: DEMO_USER_ID, entry_date: "2026-03-05", weight: 80.5 },
      { user_id: DEMO_USER_ID, entry_date: TODAY, weight: 79.7 },
    ],
    progress_photos: [
      {
        id: "photo-1",
        user_id: DEMO_USER_ID,
        image_url: "https://example.com/progress-1.jpg",
        captured_at: "2026-03-10T07:00:00.000Z",
      },
    ],
  };
}

function setupMock(overrides: Partial<ReturnType<typeof baseSeed>> = {}) {
  return installMockSupabase({ seed: { ...baseSeed(), ...overrides } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("logMeal", () => {
  it("rejects empty names", async () => {
    setupMock();

    await expect(logMeal({ name: "", calories: 400 })).resolves.toEqual({
      success: false,
      error: "name and calories are required",
      failureClass: "validation_error",
    });
  });

  it("clamps negative calories to 0", async () => {
    const client = setupMock();
    const result = await logMeal({ name: "Shake", calories: -50, protein: 25 });

    expect(result.success).toBe(true);
    expect(client.__tables.meals.at(-1)?.calories).toBe(0);
    expect(result.state.totalCalories).toBe(750);
  });

  it("sanitizes meal names", async () => {
    const client = setupMock();
    await logMeal({ name: `<b>Chicken & Rice</b>`, calories: 500 });

    expect(client.__tables.meals.at(-1)?.meal_name).toBe("bChicken  Rice/b");
  });

  it("returns success with state shape", async () => {
    setupMock();
    const result = await logMeal({ name: "Greek yogurt", calories: 220, protein: 18, carbs: 12, fats: 5 });

    expect(result.success).toBe(true);
    expect(result.state).toMatchObject({
      date: TODAY,
      meals: expect.any(Array),
      totalCalories: expect.any(Number),
      goals: expect.objectContaining({ calories: 2000 }),
      preferences: expect.objectContaining({ unitWeight: "kg" }),
    });
  });

  it("recalculates daily totals after insert", async () => {
    const client = setupMock();
    await logMeal({ name: "Soup", calories: 150, protein: 10, carbs: 12, fats: 4 });

    const totalsRow = client.__tables.daily_totals.find((row) => row.entry_date === TODAY);
    expect(totalsRow).toMatchObject({
      total_calories: 900,
      total_protein: 55,
      total_carbs: 82,
      total_fats: 26,
      meal_count: 3,
    });
  });
});

describe("deleteMeal", () => {
  it("rejects empty meal IDs", async () => {
    setupMock();
    await expect(deleteMeal({ meal_id: "" })).resolves.toEqual({
      success: false,
      error: "meal_id is required",
      failureClass: "validation_error",
    });
  });

  it("rejects SQL injection meal IDs", async () => {
    setupMock();
    const result = await deleteMeal({ meal_id: "x,user_id.neq.foo" });

    expect(result).toEqual({
      success: false,
      error: "Invalid meal_id format",
      failureClass: "validation_error",
    });
  });

  it("accepts valid UUID meal IDs", async () => {
    const client = setupMock();
    const result = await deleteMeal({ meal_id: UUID_MEAL_ID, date: TODAY });

    expect(result.success).toBe(true);
    expect(client.__tables.meals.find((row) => row.id === UUID_MEAL_ID)).toBeUndefined();
  });

  it("accepts valid legacy meal IDs", async () => {
    const client = setupMock();
    const result = await deleteMeal({ meal_id: LEGACY_MEAL_ID, date: TODAY });

    expect(result.success).toBe(true);
    expect(client.__tables.meals.find((row) => row.legacy_meal_id === LEGACY_MEAL_ID)).toBeUndefined();
  });
});

describe("updateGoals", () => {
  it("clamps calories to the max range", async () => {
    setupMock();
    const result = await updateGoals({ calories: 999999, date: TODAY });

    expect(result.success).toBe(true);
    expect(result.state.goals.calories).toBe(50000);
  });

  it("preserves existing values for null params", async () => {
    setupMock();
    const result = await updateGoals({
      calories: 2300,
      protein: null as unknown as number,
      carbs: null as unknown as number,
      fats: null as unknown as number,
      date: TODAY,
    });

    expect(result.success).toBe(true);
    expect(result.state.goals).toMatchObject({
      calories: 2300,
      protein: 150,
      carbs: 200,
      fats: 65,
    });
  });
});

describe("logWeight", () => {
  it("rejects zero weight", async () => {
    setupMock();
    const result = await logWeight({ weight: 0 });

    expect(result).toEqual({
      success: false,
      error: "weight must be a positive number",
      failureClass: "validation_error",
    });
  });

  it("rejects negative weight", async () => {
    setupMock();
    const result = await logWeight({ weight: -5 });

    expect(result).toEqual({
      success: false,
      error: "weight must be a positive number",
      failureClass: "validation_error",
    });
  });

  it("clamps weight to a max of 1000", async () => {
    const client = setupMock();
    const result = await logWeight({ weight: 1400, date: TODAY, range: "90D" });

    expect(result.success).toBe(true);
    expect(result.progress.currentWeight).toBe(1000);
    expect(client.__tables.weight_entries.find((row) => row.entry_date === TODAY)?.weight).toBe(1000);
  });
});

describe("updatePreferences", () => {
  it("sanitizes the language field", async () => {
    setupMock();
    const result = await updatePreferences({ language: `<en-US>` });

    expect(result.success).toBe(true);
    expect(result.preferences.language).toBe("en-US");
  });

  it("clamps height_cm", async () => {
    setupMock();
    const result = await updatePreferences({ height_cm: 999 });

    expect(result.success).toBe(true);
    expect(result.preferences.height_cm).toBe(300);
  });
});

describe("syncState", () => {
  it("returns state, progress, and mode", async () => {
    setupMock();
    const result = await syncState({ date: TODAY, range: "30D", page: "progress" });

    expect(result).toMatchObject({
      success: true,
      state: expect.any(Object),
      progress: expect.any(Object),
      mode: "demo",
      page: "progress",
    });
  });

  it("defaults range to 90D", async () => {
    setupMock();
    const result = await syncState({ date: TODAY });

    expect(result.success).toBe(true);
    expect(result.progress.range).toBe("90D");
  });
});

describe("getProgress", () => {
  it("returns the expected progress keys", async () => {
    setupMock();
    const result = await getProgress({ range: "90D" });

    expect(result.success).toBe(true);
    expect(result.progress).toMatchObject({
      range: "90D",
      currentWeight: expect.any(Number),
      weightSeries: expect.any(Array),
      weeklyEnergy: expect.any(Object),
      bmi: expect.any(Object),
      streak: expect.any(Object),
    });
  });
});

describe("runDailyCheckin", () => {
  it("returns a recommendations array", async () => {
    setupMock();
    const result = await runDailyCheckin({ date: TODAY, range: "90D" });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.checkin.recommendations)).toBe(true);
    expect(result.checkin.recommendations.length).toBeGreaterThan(0);
  });

  it("includes calorie, protein, and streak data", async () => {
    setupMock();
    const result = await runDailyCheckin({ date: TODAY, range: "90D" });

    expect(result.checkin).toMatchObject({
      calories: { current: 750, goal: 2000 },
      protein: { current: 45, goal: 150 },
      streak: expect.any(Number),
    });
  });
});

describe("runWeeklyReview", () => {
  it("returns an insights array", async () => {
    setupMock();
    const result = await runWeeklyReview();

    expect(result.success).toBe(true);
    expect(Array.isArray(result.review.insights)).toBe(true);
  });

  it("includes consumedAverage as a number", async () => {
    setupMock();
    const result = await runWeeklyReview();

    expect(typeof result.review.consumedAverage).toBe("number");
  });

  it("includes calorieGoal as a number", async () => {
    setupMock();
    const result = await runWeeklyReview();

    expect(result.review.calorieGoal).toBe(2000);
  });

  it("does not include burnedAverage", async () => {
    setupMock();
    const result = await runWeeklyReview();

    expect("burnedAverage" in result.review).toBe(false);
  });
});

describe("suggestGoalAdjustments", () => {
  it("returns currentGoals and proposedGoals", async () => {
    setupMock();
    const result = await suggestGoalAdjustments();

    expect(result.success).toBe(true);
    expect(result.suggestion).toMatchObject({
      currentGoals: expect.any(Object),
      proposedGoals: expect.any(Object),
    });
  });

  it("keeps proposed calories within a valid range", async () => {
    setupMock();
    const result = await suggestGoalAdjustments();

    expect(result.suggestion.proposedGoals.calories).toBeGreaterThanOrEqual(1400);
    expect(result.suggestion.proposedGoals.calories).toBeLessThanOrEqual(3800);
  });
});
