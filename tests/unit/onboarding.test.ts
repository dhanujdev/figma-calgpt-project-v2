import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserProfile, syncState } from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const TODAY = "2026-03-12";

function setupExistingUser() {
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
      weight_entries: [{ user_id: DEMO_USER_ID, entry_date: TODAY, weight: 80.8 }],
      badge_events: [],
      progress_photos: [],
      streak_events: [],
      agent_notes: [],
    },
  });
}

function setupBrandNewUser() {
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
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("onboarding guidance", () => {
  it("marks a brand-new profile as a new user", async () => {
    setupBrandNewUser();

    const result = await getUserProfile();

    expect(result.success).toBe(true);
    expect(result.profile.isNewUser).toBe(true);
    expect(result.profile.onboarding).toMatchObject({
      isNewUser: true,
      suggestedPrompt: expect.stringContaining("Log breakfast"),
    });
    expect(result.profile.onboarding.starterPrompts).toHaveLength(5);
  });

  it("marks an active profile as not new", async () => {
    setupExistingUser();

    const result = await getUserProfile();

    expect(result.success).toBe(true);
    expect(result.profile.isNewUser).toBe(false);
    expect(result.profile.onboarding.isNewUser).toBe(false);
  });

  it("includes onboarding guidance in sync_state for a new user", async () => {
    setupBrandNewUser();

    const result = await syncState({ date: TODAY, range: "90D" });

    expect(result.success).toBe(true);
    expect(result.state.onboarding).toMatchObject({
      isNewUser: true,
      summary: expect.stringContaining("log a first meal"),
    });
  });

  it("keeps onboarding guidance but disables new-user mode after activity starts", async () => {
    setupExistingUser();

    const result = await syncState({ date: TODAY, range: "90D" });

    expect(result.success).toBe(true);
    expect(result.state.onboarding.isNewUser).toBe(false);
    expect(result.state.onboarding.starterPrompts[0]).toBe("Show my dashboard.");
  });
});
