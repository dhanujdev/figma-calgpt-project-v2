import { describe, expect, it } from "vitest";
import { __testables } from "../../api/mcp.ts";

describe("mcp gateway action summaries", () => {
  it("adds a meal-save summary when state is returned", () => {
    const content = __testables.toolStructuredContent(
      "log_meal",
      { name: "Greek yogurt bowl", calories: 350 },
      {
        success: true,
        state: {
          totalCalories: 850,
          goals: { calories: 2000 },
          meals: [{ id: "1" }, { id: "2" }],
        },
        mode: "demo",
        message: "Logged Greek yogurt bowl.",
      },
    );

    expect(content.actionSummary).toMatchObject({
      title: "Meal saved",
      summary: expect.stringContaining("Greek yogurt bowl saved for 350 kcal."),
    });
    expect(String(content.actionSummary.summary)).toContain("Today is 850/2000 kcal.");
  });

  it("adds a weight-save summary when progress is returned", () => {
    const content = __testables.toolStructuredContent(
      "log_weight",
      { weight: 75.8 },
      {
        success: true,
        progress: {
          currentWeight: 75.8,
          streak: { current: 3 },
          bmi: { value: 24.2, status: "Healthy" },
        },
        mode: "demo",
      },
    );

    expect(content.actionSummary).toEqual({
      title: "Weight saved",
      summary: "Your latest weight is 75.8 kg and progress has been refreshed.",
      detailLines: ["Current weight 75.8 kg", "Streak 3 days", "BMI 24.2 (Healthy)"],
    });
  });

  it("adds goal details for the fields the user changed", () => {
    const content = __testables.toolStructuredContent(
      "update_goals",
      { calories: 2200, protein: 160, target_date: "2026-06-01" },
      {
        success: true,
        state: {
          goals: {
            calories: 2200,
            protein: 160,
            carbs: 210,
            fats: 70,
            goalWeight: 72,
            targetDate: "2026-06-01",
          },
        },
        mode: "demo",
      },
    );

    expect(content.actionSummary).toEqual({
      title: "Goals updated",
      summary: "Your nutrition targets were saved.",
      detailLines: ["Calories goal 2200 kcal", "Protein goal 160 g", "Target date 2026-06-01"],
    });
  });

  it("names the removed meal in delete summaries when available", () => {
    const content = __testables.toolStructuredContent(
      "delete_meal",
      { meal_id: "meal-1" },
      {
        success: true,
        deletedMealName: "Greek yogurt bowl",
        state: {
          totalCalories: 500,
          goals: { calories: 2000 },
          meals: [{ id: "2" }],
        },
        mode: "demo",
      },
    );

    expect(content.actionSummary).toEqual({
      title: "Meal removed",
      summary: "Greek yogurt bowl was removed. Today is 500/2000 kcal. 1 meal logged.",
    });
  });

  it("adds richer saved preference details", () => {
    const content = __testables.toolStructuredContent(
      "update_preferences",
      { unit_weight: "lb", reminder_enabled: true, reminder_time: "19:30", theme_preset: "sand" },
      {
        success: true,
        preferences: {
          unit_weight: "lb",
          reminder_enabled: true,
          reminder_time: "19:30",
          theme_preset: "sand",
        },
      },
    );

    expect(content.actionSummary).toEqual({
      title: "Preferences updated",
      summary: "Your preferences were saved.",
      detailLines: ["Weight unit lb", "Reminders on", "Reminder time 19:30", "Theme sand"],
    });
  });

  it("uses Supabase-compatible OAuth scopes in the auth challenge", () => {
    expect(__testables.OAUTH_SCOPES).toEqual(["openid", "email", "profile"]);
    const challenge = __testables.authChallengeMeta({
      appOrigin: "https://figma-calgpt-project-v2.vercel.app",
    })["mcp/www_authenticate"][0];
    expect(
      challenge,
    ).toContain('scope="openid email profile"');
  });
});
