import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMealSuggestions } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";

function setupMock({
  goals = { calories: 2000, protein: 150, carbs: 200, fats: 65 },
  totals = { total_calories: 900, total_protein: 50, total_carbs: 90, total_fats: 25, meal_count: 2 },
  notes = [],
}: {
  goals?: { calories: number; protein: number; carbs: number; fats: number };
  totals?: { total_calories: number; total_protein: number; total_carbs: number; total_fats: number; meal_count: number };
  notes?: Array<Record<string, unknown>>;
} = {}) {
  installMockSupabase({
    seed: {
      nutrition_goals: [
        {
          user_id: DEMO_USER_ID,
          calories: goals.calories,
          protein: goals.protein,
          carbs: goals.carbs,
          fats: goals.fats,
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
      daily_totals: [
        {
          user_id: DEMO_USER_ID,
          entry_date: TODAY,
          ...totals,
        },
      ],
      weight_entries: [],
      progress_photos: [],
      streak_events: [],
      badge_events: [],
      agent_notes: notes,
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("getMealSuggestions", () => {
  it("suggests high-protein options when protein is low", async () => {
    setupMock({
      totals: { total_calories: 900, total_protein: 40, total_carbs: 90, total_fats: 25, meal_count: 2 },
    });

    const result = await getMealSuggestions({ date: TODAY });
    expect(result.success).toBe(true);
    expect(result.suggestions[0].reason).toContain("High-protein");
  });

  it("suggests lower-calorie options when near goal", async () => {
    setupMock({
      totals: { total_calories: 1750, total_protein: 125, total_carbs: 170, total_fats: 55, meal_count: 3 },
    });

    const result = await getMealSuggestions({ date: TODAY });
    expect(result.success).toBe(true);
    expect(result.suggestions[0].reason).toContain("Lower-calorie");
  });

  it("respects vegetarian notes", async () => {
    setupMock({
      notes: [
        {
          user_id: DEMO_USER_ID,
          note_key: "diet:vegetarian",
          note_value: "Vegetarian only.",
          updated_at: "2026-03-11T09:00:00.000Z",
        },
      ],
    });

    const result = await getMealSuggestions({ date: TODAY });
    expect(result.success).toBe(true);
    expect(result.suggestions.every((item) =>
      ["Protein shake", "Greek yogurt bowl", "Tofu stir-fry"].includes(item.name),
    )).toBe(true);
  });

  it("returns empty suggestions when goals are met", async () => {
    setupMock({
      totals: { total_calories: 2000, total_protein: 150, total_carbs: 200, total_fats: 65, meal_count: 4 },
    });

    const result = await getMealSuggestions({ date: TODAY });
    expect(result.suggestions).toEqual([]);
  });

  it("handles zero goals gracefully", async () => {
    setupMock({
      goals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      totals: { total_calories: 0, total_protein: 0, total_carbs: 0, total_fats: 0, meal_count: 0 },
    });

    const result = await getMealSuggestions({ date: TODAY });
    expect(result.suggestions).toEqual([]);
  });
});
