import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProgress,
  logWeight,
  saveAgentNote,
} from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const TODAY = "2026-03-13";

function authContext(token = "token-user-1") {
  return { authHeader: `Bearer ${token}`, source: "mcp_gateway", widgetVersion: "v13" as const };
}

function setupMock() {
  return installMockSupabase({
    auth: {
      usersByToken: {
        "token-user-1": USER_ID,
        "token-user-2": OTHER_USER_ID,
      },
    },
    seed: {
      nutrition_goals: [
        {
          user_id: USER_ID,
          calories: 2000,
          protein: 150,
          carbs: 200,
          fats: 65,
          goal_weight: 75,
          start_weight: 80,
          target_date: "2026-06-01",
        },
        {
          user_id: OTHER_USER_ID,
          calories: 2100,
          protein: 155,
          carbs: 210,
          fats: 70,
          goal_weight: 78,
          start_weight: 82,
          target_date: "2026-07-01",
        },
      ],
      user_preferences: [
        {
          user_id: USER_ID,
          unit_weight: "kg",
          unit_energy: "kcal",
          language: "en",
          reminder_enabled: false,
          reminder_time: "20:00",
          theme_preset: "midnight",
          streak_badge_notifications: true,
          height_cm: 180,
        },
        {
          user_id: OTHER_USER_ID,
          unit_weight: "kg",
          unit_energy: "kcal",
          language: "en",
          reminder_enabled: false,
          reminder_time: "20:00",
          theme_preset: "sand",
          streak_badge_notifications: true,
          height_cm: 175,
        },
      ],
      analytics_events: [],
      badge_events: [],
      weight_entries: [],
      agent_notes: [],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-13T15:00:00.000Z"));
});

describe("write rate limiting", () => {
  it("allows the first three writes and blocks the fourth within 10 seconds", async () => {
    const client = setupMock();

    const first = await logWeight({ weight: 79.8, date: TODAY, range: "90D" }, authContext());
    const second = await logWeight({ weight: 79.7, date: TODAY, range: "90D" }, authContext());
    const third = await logWeight({ weight: 79.6, date: TODAY, range: "90D" }, authContext());
    const fourth = await saveAgentNote(
      { note_key: "preference:breakfast", note_value: "Prefers savory breakfasts." },
      authContext(),
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
    expect(fourth).toMatchObject({
      success: false,
      failureClass: "rate_limited",
      retryAfterSeconds: 10,
    });
    expect(client.__tables.analytics_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_name: "write_attempt", tool_name: "log_weight", user_id: USER_ID }),
        expect.objectContaining({ event_name: "write_rate_limited", tool_name: "save_agent_note", user_id: USER_ID }),
      ]),
    );
  });

  it("allows writes again after the cooldown window", async () => {
    setupMock();

    await logWeight({ weight: 79.8, date: TODAY, range: "90D" }, authContext());
    await logWeight({ weight: 79.7, date: TODAY, range: "90D" }, authContext());
    await logWeight({ weight: 79.6, date: TODAY, range: "90D" }, authContext());

    vi.advanceTimersByTime(10_001);

    const next = await logWeight({ weight: 79.5, date: TODAY, range: "90D" }, authContext());

    expect(next.success).toBe(true);
  });

  it("does not rate limit read tools", async () => {
    setupMock();

    await logWeight({ weight: 79.8, date: TODAY, range: "90D" }, authContext());
    await logWeight({ weight: 79.7, date: TODAY, range: "90D" }, authContext());
    await logWeight({ weight: 79.6, date: TODAY, range: "90D" }, authContext());

    const result = await getProgress({ range: "90D" }, authContext());

    expect(result).toMatchObject({
      success: true,
      progress: expect.any(Object),
    });
  });

  it("keeps limits independent per user", async () => {
    setupMock();

    await logWeight({ weight: 79.8, date: TODAY, range: "90D" }, authContext("token-user-1"));
    await logWeight({ weight: 79.7, date: TODAY, range: "90D" }, authContext("token-user-1"));
    await logWeight({ weight: 79.6, date: TODAY, range: "90D" }, authContext("token-user-1"));

    const blocked = await logWeight({ weight: 79.5, date: TODAY, range: "90D" }, authContext("token-user-1"));
    const otherUser = await logWeight({ weight: 81.2, date: TODAY, range: "90D" }, authContext("token-user-2"));

    expect(blocked).toMatchObject({
      success: false,
      failureClass: "rate_limited",
    });
    expect(otherUser.success).toBe(true);
  });
});
