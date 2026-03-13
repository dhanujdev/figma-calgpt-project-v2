import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecentMeals } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

function setupMock() {
  installMockSupabase({
    seed: {
      meals: [
        {
          id: "meal-1",
          user_id: DEMO_USER_ID,
          meal_name: "Chicken bowl",
          calories: 600,
          protein: 40,
          carbs: 50,
          fats: 18,
          consumed_at: "2026-03-12T12:00:00.000Z",
        },
        {
          id: "meal-2",
          user_id: DEMO_USER_ID,
          meal_name: "Greek yogurt bowl",
          calories: 250,
          protein: 22,
          carbs: 20,
          fats: 6,
          consumed_at: "2026-03-12T08:00:00.000Z",
        },
        {
          id: "meal-3",
          user_id: DEMO_USER_ID,
          meal_name: "Chicken bowl",
          calories: 650,
          protein: 42,
          carbs: 52,
          fats: 20,
          consumed_at: "2026-03-11T12:00:00.000Z",
        },
        {
          id: "meal-4",
          user_id: DEMO_USER_ID,
          meal_name: "Greek yogurt bowl",
          calories: 230,
          protein: 20,
          carbs: 18,
          fats: 5,
          consumed_at: "2026-03-10T08:00:00.000Z",
        },
        {
          id: "meal-5",
          user_id: DEMO_USER_ID,
          meal_name: "Chicken bowl",
          calories: 630,
          protein: 41,
          carbs: 51,
          fats: 19,
          consumed_at: "2026-03-09T12:00:00.000Z",
        },
        {
          id: "meal-6",
          user_id: DEMO_USER_ID,
          meal_name: "Protein shake",
          calories: 180,
          protein: 30,
          carbs: 8,
          fats: 3,
          consumed_at: "2026-03-11T18:00:00.000Z",
        },
      ],
      nutrition_goals: [],
      user_preferences: [],
      daily_totals: [],
      weight_entries: [],
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

describe("getRecentMeals", () => {
  it("returns unique meals by name", async () => {
    setupMock();
    const result = await getRecentMeals();

    expect(result.success).toBe(true);
    expect(result.meals.map((meal) => meal.name)).toEqual([
      "Chicken bowl",
      "Greek yogurt bowl",
      "Protein shake",
    ]);
  });

  it("respects the limit parameter", async () => {
    setupMock();
    const result = await getRecentMeals({ limit: 2 });

    expect(result.meals).toHaveLength(2);
  });

  it("orders by frequency then recency", async () => {
    setupMock();
    const result = await getRecentMeals();

    expect(result.meals[0].name).toBe("Chicken bowl");
    expect(result.meals[1].name).toBe("Greek yogurt bowl");
  });

  it("includes average calories per meal name", async () => {
    setupMock();
    const result = await getRecentMeals();

    expect(result.meals[0]).toMatchObject({
      name: "Chicken bowl",
      avgCalories: 627,
    });
  });

  it("returns an empty array for a new user", async () => {
    installMockSupabase({
      seed: {
        meals: [],
        nutrition_goals: [],
        user_preferences: [],
        daily_totals: [],
        weight_entries: [],
        progress_photos: [],
        streak_events: [],
        badge_events: [],
        agent_notes: [],
      },
    });

    const result = await getRecentMeals();
    expect(result.meals).toEqual([]);
  });
});
