import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testables } from "../../supabase/functions/server/mcp_handler.tsx";

const goals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  goalWeight: 75,
  startWeight: 80,
  targetDate: null,
};

function day(date: string, overrides: Partial<Record<"calories" | "protein" | "carbs" | "fats" | "meals", number>> = {}) {
  return {
    date,
    calories: 1900,
    protein: 120,
    carbs: 180,
    fats: 55,
    meals: 3,
    ...overrides,
  };
}

function detect(overrides?: {
  recentDays?: Array<ReturnType<typeof day>>;
  recentMeals?: Array<{ loggedDate: string; consumedAt: string }>;
  weightSeries?: Array<{ date: string; weight: number }>;
  streakCurrent?: number;
}) {
  return __testables.detectCoachingPatterns({
    goals,
    recentDays:
      overrides?.recentDays ??
      [
        day("2026-03-06"),
        day("2026-03-07"),
        day("2026-03-08"),
        day("2026-03-09"),
        day("2026-03-10"),
        day("2026-03-11"),
        day("2026-03-12"),
      ],
    recentMeals: overrides?.recentMeals ?? [],
    weightSeries: overrides?.weightSeries ?? [],
    streakCurrent: overrides?.streakCurrent ?? 0,
    timeZone: "America/New_York",
  });
}

describe("coaching patterns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
  });

  it("detects protein_deficit when protein is below 70% goal for 4+ days", () => {
    const patterns = detect({
      recentDays: [
        day("2026-03-06", { protein: 80 }),
        day("2026-03-07", { protein: 85 }),
        day("2026-03-08", { protein: 90 }),
        day("2026-03-09", { protein: 95 }),
        day("2026-03-10", { protein: 120 }),
        day("2026-03-11", { protein: 130 }),
        day("2026-03-12", { protein: 140 }),
      ],
    });

    const pattern = patterns.find((item) => item.code === "protein_deficit");
    expect(pattern?.message).toContain("150g target");
  });

  it("does not detect protein_deficit for 3 or fewer days", () => {
    const patterns = detect({
      recentDays: [
        day("2026-03-06", { protein: 80 }),
        day("2026-03-07", { protein: 85 }),
        day("2026-03-08", { protein: 90 }),
        day("2026-03-09", { protein: 120 }),
        day("2026-03-10", { protein: 130 }),
        day("2026-03-11", { protein: 140 }),
        day("2026-03-12", { protein: 150 }),
      ],
    });

    expect(patterns.some((item) => item.code === "protein_deficit")).toBe(false);
  });

  it("detects calorie_overconsumption and includes the overage amount", () => {
    const patterns = detect({
      recentDays: [
        day("2026-03-06", { calories: 2300 }),
        day("2026-03-07", { calories: 2300 }),
        day("2026-03-08", { calories: 2300 }),
        day("2026-03-09"),
        day("2026-03-10"),
        day("2026-03-11"),
        day("2026-03-12"),
      ],
    });

    const pattern = patterns.find((item) => item.code === "calorie_overconsumption");
    expect(pattern?.message).toContain("300 calories");
  });

  it("detects skipped_meals and names the skipped day", () => {
    const patterns = detect({
      recentDays: [
        day("2026-03-06"),
        day("2026-03-07", { calories: 0, protein: 0, carbs: 0, fats: 0, meals: 0 }),
        day("2026-03-08"),
        day("2026-03-09"),
        day("2026-03-10"),
        day("2026-03-11"),
        day("2026-03-12"),
      ],
    });

    const pattern = patterns.find((item) => item.code === "skipped_meals");
    expect(pattern?.message).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  });

  it("detects late_night_eating when 2+ meals are logged after 21:00", () => {
    const patterns = detect({
      recentMeals: [
        { loggedDate: "2026-03-10", consumedAt: "2026-03-11T01:30:00.000Z" },
        { loggedDate: "2026-03-11", consumedAt: "2026-03-12T02:15:00.000Z" },
      ],
    });

    const pattern = patterns.find((item) => item.code === "late_night_eating");
    expect(pattern?.message).toContain("sleep and digestion");
  });

  it("detects weight_plateau with 14+ days inside a 0.2 range", () => {
    const patterns = detect({
      weightSeries: [
        { date: "2026-02-27", weight: 79.1 },
        { date: "2026-02-28", weight: 79.2 },
        { date: "2026-03-01", weight: 79.15 },
        { date: "2026-03-02", weight: 79.18 },
        { date: "2026-03-03", weight: 79.12 },
        { date: "2026-03-04", weight: 79.11 },
        { date: "2026-03-05", weight: 79.2 },
        { date: "2026-03-06", weight: 79.18 },
        { date: "2026-03-07", weight: 79.1 },
        { date: "2026-03-08", weight: 79.17 },
        { date: "2026-03-09", weight: 79.13 },
        { date: "2026-03-10", weight: 79.16 },
        { date: "2026-03-11", weight: 79.12 },
        { date: "2026-03-12", weight: 79.19 },
      ],
    });

    expect(patterns.some((item) => item.code === "weight_plateau")).toBe(true);
  });

  it("detects streak_milestone at the supported thresholds", () => {
    const patterns = detect({ streakCurrent: 14 });
    const pattern = patterns.find((item) => item.code === "streak_milestone");

    expect(pattern?.message).toContain("14-day");
    expect(pattern?.badgeCode).toBe("streak_14");
  });

  it("detects macro_imbalance when one macro repeatedly exceeds 150% of goal", () => {
    const patterns = detect({
      recentDays: [
        day("2026-03-06", { carbs: 320 }),
        day("2026-03-07", { carbs: 330 }),
        day("2026-03-08", { carbs: 340 }),
        day("2026-03-09"),
        day("2026-03-10"),
        day("2026-03-11"),
        day("2026-03-12"),
      ],
    });

    const pattern = patterns.find((item) => item.code === "macro_imbalance");
    expect(pattern?.message).toContain("Carbs exceeded 150% of goal");
  });
});

describe("weight goal projection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
  });

  it("calculates a weight-loss projection when trend is moving toward goal", () => {
    const projection = __testables.buildWeightGoalProjection(
      [
        { date: "2026-02-20", weight: 80 },
        { date: "2026-03-12", weight: 78 },
      ],
      goals,
    );

    expect(projection).toMatchObject({
      direction: "loss",
      projectedDate: expect.any(String),
    });
  });

  it("calculates a weight-gain projection when trend is moving toward goal", () => {
    const projection = __testables.buildWeightGoalProjection(
      [
        { date: "2026-02-20", weight: 70 },
        { date: "2026-03-12", weight: 72 },
      ],
      { ...goals, goalWeight: 75, startWeight: 70 },
    );

    expect(projection?.direction).toBe("gain");
  });

  it("returns null when there is no clear trend toward goal", () => {
    const projection = __testables.buildWeightGoalProjection(
      [
        { date: "2026-02-20", weight: 78 },
        { date: "2026-03-12", weight: 78.05 },
      ],
      goals,
    );

    expect(projection).toBeNull();
  });
});
