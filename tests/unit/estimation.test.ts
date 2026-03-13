import { beforeEach, describe, expect, it, vi } from "vitest";
import { logMeal, syncState } from "../../supabase/functions/server/mcp_handler.tsx";
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

describe("logMeal estimation notes", () => {
  it("stores estimation_notes", async () => {
    const client = setupMock();
    const result = await logMeal({
      name: "Chipotle bowl",
      calories: 700,
      protein: 40,
      carbs: 60,
      fats: 22,
      estimation_notes: "Estimated from a large burrito bowl with extra rice.",
      date: TODAY,
    });

    expect(result.success).toBe(true);
    expect(client.__tables.meals[0].estimation_notes).toBe(
      "Estimated from a large burrito bowl with extra rice.",
    );
  });

  it("returns notes in meal objects", async () => {
    setupMock();
    await logMeal({
      name: "Chipotle bowl",
      calories: 700,
      estimation_notes: "Estimated from menu defaults.",
      date: TODAY,
    });

    const result = await syncState({ date: TODAY, range: "90D" });
    expect(result.state.meals[0]).toMatchObject({
      estimationNotes: "Estimated from menu defaults.",
    });
  });

  it("handles null notes backward compatibly", async () => {
    setupMock();
    await logMeal({
      name: "Egg wrap",
      calories: 320,
      date: TODAY,
    });

    const result = await syncState({ date: TODAY, range: "90D" });
    expect(result.state.meals[0].estimationNotes).toBeNull();
  });

  it("sanitizes notes text", async () => {
    const client = setupMock();
    await logMeal({
      name: "Smoothie",
      calories: 280,
      estimation_notes: `<b>Estimated & rounded</b>`,
      date: TODAY,
    });

    expect(client.__tables.meals[0].estimation_notes).toBe("bEstimated  rounded/b");
  });
});
