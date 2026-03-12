import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  timestamp: string;
}

export interface DailyState {
  date: string;
  meals: Meal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    goalWeight: number | null;
    startWeight: number | null;
    targetDate: string | null;
  };
  preferences: {
    unitWeight: "kg" | "lb";
    unitEnergy: "kcal" | "kj";
    language: string;
    reminderEnabled: boolean;
    reminderTime: string;
    themePreset: string;
    streakBadgeNotifications: boolean;
    heightCm: number;
  };
}

type RequestContext = {
  authHeader?: string | null;
};

type UserIdentity = {
  userId: string;
  authenticated: boolean;
  authError?: string;
};

type DbClient = ReturnType<typeof createClient>;

type WeightPoint = {
  date: string;
  weight: number;
};

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const ALLOW_DEMO_MODE = Deno.env.get("ALLOW_DEMO_MODE") !== "false";

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  goal_weight: 65,
  start_weight: 76,
  target_date: null as string | null,
};

const DEFAULT_PREFERENCES = {
  unit_weight: "kg",
  unit_energy: "kcal",
  language: "en",
  reminder_enabled: false,
  reminder_time: "20:00",
  theme_preset: "midnight",
  streak_badge_notifications: true,
  height_cm: 170,
};

const RANGE_DAYS: Record<string, number> = {
  "7D": 7,
  "14D": 14,
  "30D": 30,
  "90D": 90,
  "6M": 182,
  "1Y": 365,
  ALL: 3650,
};

function dbClient(): DbClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function normalizeDate(raw?: string): string {
  if (!raw) return todayIsoDate();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();
  return parsed.toISOString().split("T")[0];
}

function parseBearer(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function resolveIdentity(context?: RequestContext): Promise<UserIdentity> {
  const token = parseBearer(context?.authHeader);

  if (!token) {
    if (!ALLOW_DEMO_MODE) {
      return {
        userId: DEMO_USER_ID,
        authenticated: false,
        authError: "Missing bearer token",
      };
    }
    return { userId: DEMO_USER_ID, authenticated: false };
  }

  const supabase = dbClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user?.id) {
    if (!ALLOW_DEMO_MODE) {
      return {
        userId: DEMO_USER_ID,
        authenticated: false,
        authError: error?.message ?? "Invalid token",
      };
    }

    return {
      userId: DEMO_USER_ID,
      authenticated: false,
      authError: error?.message ?? "Invalid token; running in demo mode",
    };
  }

  return {
    userId: data.user.id,
    authenticated: true,
  };
}

function authRequiredResult(message = "Authentication required") {
  return {
    success: false,
    authRequired: true,
    error: message,
  };
}

let schemaReadyCache: boolean | null = null;

function isMissingRelationError(message: string) {
  return message.includes("relation") && message.includes("does not exist");
}

async function isSchemaReady() {
  if (schemaReadyCache != null) return schemaReadyCache;
  try {
    const supabase = dbClient();
    const { error } = await supabase.from("nutrition_goals").select("user_id").limit(1);
    if (error) {
      if (isMissingRelationError(error.message)) {
        schemaReadyCache = false;
        return false;
      }
      throw new Error(error.message);
    }
    schemaReadyCache = true;
    return true;
  } catch {
    schemaReadyCache = false;
    return false;
  }
}

function legacyDefaultState(date: string): DailyState {
  return {
    date,
    meals: [],
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFats: 0,
    goals: {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fats: 65,
      goalWeight: 65,
      startWeight: 76,
      targetDate: null,
    },
    preferences: {
      unitWeight: "kg",
      unitEnergy: "kcal",
      language: "en",
      reminderEnabled: false,
      reminderTime: "20:00",
      themePreset: "midnight",
      streakBadgeNotifications: true,
      heightCm: 170,
    },
  };
}

function legacyStateFromRaw(raw: unknown, date: string): DailyState {
  if (!raw || typeof raw !== "object") return legacyDefaultState(date);
  const candidate = raw as Record<string, unknown>;
  const goals = (candidate.goals ?? {}) as Record<string, unknown>;

  return {
    date: String(candidate.date ?? date),
    meals: Array.isArray(candidate.meals)
      ? candidate.meals.map((meal) => {
          const row = meal as Record<string, unknown>;
          return {
            id: String(row.id ?? `meal_${Date.now()}`),
            name: String(row.name ?? "Meal"),
            calories: Number(row.calories ?? 0),
            protein: Number(row.protein ?? 0),
            carbs: Number(row.carbs ?? 0),
            fats: Number(row.fats ?? 0),
            timestamp: String(row.timestamp ?? new Date().toISOString()),
          };
        })
      : [],
    totalCalories: Number(candidate.totalCalories ?? 0),
    totalProtein: Number(candidate.totalProtein ?? 0),
    totalCarbs: Number(candidate.totalCarbs ?? 0),
    totalFats: Number(candidate.totalFats ?? 0),
    goals: {
      calories: Number(goals.calories ?? 2000),
      protein: Number(goals.protein ?? 150),
      carbs: Number(goals.carbs ?? 200),
      fats: Number(goals.fats ?? 65),
      goalWeight: Number(goals.goalWeight ?? goals.goal_weight ?? 65),
      startWeight: Number(goals.startWeight ?? goals.start_weight ?? 76),
      targetDate: (goals.targetDate ?? goals.target_date ?? null) as string | null,
    },
    preferences: {
      unitWeight: "kg",
      unitEnergy: "kcal",
      language: "en",
      reminderEnabled: false,
      reminderTime: "20:00",
      themePreset: "midnight",
      streakBadgeNotifications: true,
      heightCm: 170,
    },
  };
}

async function legacyGetState(date: string) {
  const raw = await kv.get(`daily_state:${date}`);
  return legacyStateFromRaw(raw, date);
}

async function legacySaveState(state: DailyState) {
  await kv.set(`daily_state:${state.date}`, state);
}

function legacyProgressFromState(state: DailyState, range = "90D") {
  const currentWeight = Number(state.goals.startWeight ?? 76);
  return {
    range,
    currentWeight,
    startWeight: Number(state.goals.startWeight ?? 76),
    goalWeight: Number(state.goals.goalWeight ?? 65),
    targetDate: state.goals.targetDate ?? null,
    weightSeries: [{ date: state.date, weight: currentWeight }],
    weightChanges: [
      { label: "3 day", delta: 0, trend: "No change" },
      { label: "7 day", delta: 0, trend: "No change" },
      { label: "14 day", delta: 0, trend: "No change" },
      { label: "30 day", delta: 0, trend: "No change" },
      { label: "90 day", delta: 0, trend: "No change" },
      { label: "All Time", delta: 0, trend: "No change" },
    ],
    calorieSeries: [
      {
        date: state.date,
        calories: state.totalCalories,
        protein: state.totalProtein,
        carbs: state.totalCarbs,
        fats: state.totalFats,
        meals: state.meals.length,
      },
    ],
    dailyAverageCalories: state.totalCalories,
    weeklyEnergy: {
      burned: Math.round(state.goals.calories * 0.6),
      consumed: state.totalCalories,
      energy: state.totalCalories - Math.round(state.goals.calories * 0.6),
      daily: [],
    },
    bmi: {
      value: 0,
      status: "Unknown",
    },
    streak: {
      current: state.meals.length > 0 ? 1 : 0,
      week: [],
    },
    badges: state.meals.length >= 3 ? ["three_meals_day"] : [],
    photos: [],
  };
}

async function ensureGoals(supabase: DbClient, userId: string) {
  const { data, error } = await supabase
    .from("nutrition_goals")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load goals: ${error.message}`);
  }

  if (data) return data;

  const insert = {
    user_id: userId,
    ...DEFAULT_GOALS,
  };

  const { data: created, error: createError } = await supabase
    .from("nutrition_goals")
    .upsert(insert)
    .select("*")
    .single();

  if (createError) {
    throw new Error(`Failed to create goals: ${createError.message}`);
  }

  return created;
}

async function ensurePreferences(supabase: DbClient, userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load preferences: ${error.message}`);
  }

  if (data) return data;

  const insert = {
    user_id: userId,
    ...DEFAULT_PREFERENCES,
  };

  const { data: created, error: createError } = await supabase
    .from("user_preferences")
    .upsert(insert)
    .select("*")
    .single();

  if (createError) {
    throw new Error(`Failed to create preferences: ${createError.message}`);
  }

  return created;
}

async function recalcDailyTotals(supabase: DbClient, userId: string, date: string) {
  const { data: meals, error } = await supabase
    .from("meals")
    .select("calories, protein, carbs, fats")
    .eq("user_id", userId)
    .eq("logged_date", date);

  if (error) {
    throw new Error(`Failed to recalculate totals: ${error.message}`);
  }

  const totals = (meals ?? []).reduce(
    (acc, meal) => {
      acc.calories += Number(meal.calories ?? 0);
      acc.protein += Number(meal.protein ?? 0);
      acc.carbs += Number(meal.carbs ?? 0);
      acc.fats += Number(meal.fats ?? 0);
      acc.mealCount += 1;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0, mealCount: 0 },
  );

  const goals = await ensureGoals(supabase, userId);

  const { error: totalError } = await supabase.from("daily_totals").upsert(
    {
      user_id: userId,
      entry_date: date,
      total_calories: totals.calories,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fats: totals.fats,
      meal_count: totals.mealCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_date" },
  );

  if (totalError) {
    throw new Error(`Failed to save totals: ${totalError.message}`);
  }

  const { error: streakError } = await supabase.from("streak_events").upsert(
    {
      user_id: userId,
      entry_date: date,
      meals_logged: totals.mealCount,
      met_goal: totals.mealCount > 0 && totals.calories <= Number(goals.calories ?? 2000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_date" },
  );

  if (streakError) {
    throw new Error(`Failed to save streak events: ${streakError.message}`);
  }

  if (totals.mealCount >= 3) {
    await supabase.from("badge_events").upsert(
      {
        user_id: userId,
        badge_code: "three_meals_day",
      },
      { onConflict: "user_id,badge_code" },
    );
  }

  return totals;
}

async function backfillFromLegacyKv(supabase: DbClient, userId: string, date: string) {
  const { data: existing, error } = await supabase
    .from("daily_totals")
    .select("meal_count")
    .eq("user_id", userId)
    .eq("entry_date", date)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check backfill state: ${error.message}`);
  }

  if (existing) return;

  const legacy = await kv.get(`daily_state:${date}`);
  if (!legacy || typeof legacy !== "object") return;

  const legacyMeals = Array.isArray((legacy as { meals?: unknown[] }).meals)
    ? ((legacy as { meals: Array<Record<string, unknown>> }).meals ?? [])
    : [];

  if (legacyMeals.length > 0) {
    const payload = legacyMeals.map((meal) => ({
      user_id: userId,
      legacy_meal_id: String(meal.id ?? ""),
      meal_name: String(meal.name ?? "Meal"),
      calories: Number(meal.calories ?? 0),
      protein: Number(meal.protein ?? 0),
      carbs: Number(meal.carbs ?? 0),
      fats: Number(meal.fats ?? 0),
      logged_date: date,
      consumed_at: typeof meal.timestamp === "string" ? meal.timestamp : `${date}T12:00:00.000Z`,
    }));

    const { error: mealInsertError } = await supabase.from("meals").insert(payload);
    if (mealInsertError) {
      throw new Error(`Failed to backfill meals: ${mealInsertError.message}`);
    }
  }

  const legacyGoals = (legacy as { goals?: Record<string, number> }).goals;
  if (legacyGoals && typeof legacyGoals === "object") {
    const { error: goalError } = await supabase.from("nutrition_goals").upsert(
      {
        user_id: userId,
        calories: Number(legacyGoals.calories ?? DEFAULT_GOALS.calories),
        protein: Number(legacyGoals.protein ?? DEFAULT_GOALS.protein),
        carbs: Number(legacyGoals.carbs ?? DEFAULT_GOALS.carbs),
        fats: Number(legacyGoals.fats ?? DEFAULT_GOALS.fats),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (goalError) {
      throw new Error(`Failed to backfill goals: ${goalError.message}`);
    }
  }

  await recalcDailyTotals(supabase, userId, date);
}

async function buildDailyState(supabase: DbClient, userId: string, date: string): Promise<DailyState> {
  await ensureGoals(supabase, userId);
  await ensurePreferences(supabase, userId);

  await backfillFromLegacyKv(supabase, userId, date);

  const [{ data: goals, error: goalsError }, { data: preferences, error: prefError }] =
    await Promise.all([
      supabase
        .from("nutrition_goals")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

  if (goalsError) throw new Error(`Failed to fetch goals: ${goalsError.message}`);
  if (prefError) throw new Error(`Failed to fetch preferences: ${prefError.message}`);
  if (!goals) throw new Error("Failed to fetch goals: no row found for user");
  if (!preferences) throw new Error("Failed to fetch preferences: no row found for user");

  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, legacy_meal_id, meal_name, calories, protein, carbs, fats, consumed_at")
    .eq("user_id", userId)
    .eq("logged_date", date)
    .order("consumed_at", { ascending: false });

  if (mealsError) throw new Error(`Failed to fetch meals: ${mealsError.message}`);

  const { data: totalsRow } = await supabase
    .from("daily_totals")
    .select("total_calories, total_protein, total_carbs, total_fats, meal_count")
    .eq("user_id", userId)
    .eq("entry_date", date)
    .maybeSingle();

  let totals = {
    calories: Number(totalsRow?.total_calories ?? 0),
    protein: Number(totalsRow?.total_protein ?? 0),
    carbs: Number(totalsRow?.total_carbs ?? 0),
    fats: Number(totalsRow?.total_fats ?? 0),
  };

  if (!totalsRow && (meals ?? []).length > 0) {
    totals = await recalcDailyTotals(supabase, userId, date);
  }

  return {
    date,
    meals: (meals ?? []).map((meal) => ({
      id: String(meal.id ?? meal.legacy_meal_id ?? ""),
      name: String(meal.meal_name ?? "Meal"),
      calories: Number(meal.calories ?? 0),
      protein: Number(meal.protein ?? 0),
      carbs: Number(meal.carbs ?? 0),
      fats: Number(meal.fats ?? 0),
      timestamp: String(meal.consumed_at ?? `${date}T12:00:00.000Z`),
    })),
    totalCalories: totals.calories,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFats: totals.fats,
    goals: {
      calories: Number(goals.calories ?? DEFAULT_GOALS.calories),
      protein: Number(goals.protein ?? DEFAULT_GOALS.protein),
      carbs: Number(goals.carbs ?? DEFAULT_GOALS.carbs),
      fats: Number(goals.fats ?? DEFAULT_GOALS.fats),
      goalWeight: goals.goal_weight != null ? Number(goals.goal_weight) : null,
      startWeight: goals.start_weight != null ? Number(goals.start_weight) : null,
      targetDate: goals.target_date ? String(goals.target_date) : null,
    },
    preferences: {
      unitWeight: (preferences.unit_weight ?? "kg") as "kg" | "lb",
      unitEnergy: (preferences.unit_energy ?? "kcal") as "kcal" | "kj",
      language: String(preferences.language ?? "en"),
      reminderEnabled: Boolean(preferences.reminder_enabled),
      reminderTime: String(preferences.reminder_time ?? "20:00"),
      themePreset: String(preferences.theme_preset ?? "midnight"),
      streakBadgeNotifications: Boolean(preferences.streak_badge_notifications),
      heightCm: Number(preferences.height_cm ?? 170),
    },
  };
}

function rangeStart(range: string): string {
  const normalized = range.toUpperCase();
  const days = RANGE_DAYS[normalized] ?? RANGE_DAYS["90D"];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().split("T")[0];
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function round(value: number, decimals = 1) {
  const pow = 10 ** decimals;
  return Math.round(value * pow) / pow;
}

function weightChangeSummary(weightSeries: WeightPoint[]) {
  const spans = [3, 7, 14, 30, 90];
  const latest = weightSeries.at(-1)?.weight;

  const entries = spans.map((span) => {
    if (latest == null) {
      return {
        label: `${span} day`,
        delta: 0,
        trend: "No change",
      };
    }

    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() - span);
    const targetIso = targetDate.toISOString().split("T")[0];

    const baseline = [...weightSeries]
      .reverse()
      .find((point) => point.date <= targetIso)?.weight;

    const delta = baseline == null ? 0 : round(latest - baseline, 1);
    const trend = delta > 0 ? "Increase" : delta < 0 ? "Decrease" : "No change";

    return {
      label: `${span} day`,
      delta,
      trend,
    };
  });

  const allTimeDelta =
    weightSeries.length >= 2 ? round(weightSeries.at(-1)!.weight - weightSeries[0].weight, 1) : 0;

  entries.push({
    label: "All Time",
    delta: allTimeDelta,
    trend: allTimeDelta > 0 ? "Increase" : allTimeDelta < 0 ? "Decrease" : "No change",
  });

  return entries;
}

async function buildProgress(
  supabase: DbClient,
  userId: string,
  range: string,
) {
  const normalizedRange = range.toUpperCase();
  const startDate = rangeStart(normalizedRange);
  const today = todayIsoDate();

  const [
    { data: weights, error: weightsError },
    { data: totals, error: totalsError },
    { data: goals, error: goalsError },
    { data: preferences, error: prefsError },
    { data: badges, error: badgesError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    supabase
      .from("weight_entries")
      .select("entry_date, weight")
      .eq("user_id", userId)
      .gte("entry_date", startDate)
      .order("entry_date", { ascending: true }),
    supabase
      .from("daily_totals")
      .select("entry_date, total_calories, total_protein, total_carbs, total_fats, meal_count")
      .eq("user_id", userId)
      .gte("entry_date", startDate)
      .lte("entry_date", today)
      .order("entry_date", { ascending: true }),
    supabase
      .from("nutrition_goals")
      .select("*")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("badge_events")
      .select("badge_code, awarded_at")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: true }),
    supabase
      .from("progress_photos")
      .select("id, image_url, captured_at")
      .eq("user_id", userId)
      .order("captured_at", { ascending: false })
      .limit(6),
  ]);

  if (weightsError) throw new Error(`Failed to fetch weights: ${weightsError.message}`);
  if (totalsError) throw new Error(`Failed to fetch totals: ${totalsError.message}`);
  if (goalsError) throw new Error(`Failed to fetch goals for progress: ${goalsError.message}`);
  if (prefsError) throw new Error(`Failed to fetch preferences for progress: ${prefsError.message}`);
  if (!goals) throw new Error("Failed to fetch goals for progress: no row found for user");
  if (!preferences) throw new Error("Failed to fetch preferences for progress: no row found for user");
  if (badgesError) throw new Error(`Failed to fetch badges: ${badgesError.message}`);
  if (photosError) throw new Error(`Failed to fetch photos: ${photosError.message}`);

  const weightSeries: WeightPoint[] = (weights ?? []).map((row) => ({
    date: String(row.entry_date),
    weight: Number(row.weight),
  }));

  const calorieSeries = (totals ?? []).map((row) => ({
    date: String(row.entry_date),
    calories: Number(row.total_calories ?? 0),
    protein: Number(row.total_protein ?? 0),
    carbs: Number(row.total_carbs ?? 0),
    fats: Number(row.total_fats ?? 0),
    meals: Number(row.meal_count ?? 0),
  }));

  const weeklyPoints = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - (6 - i));
    const iso = day.toISOString().split("T")[0];
    const dayData = calorieSeries.find((entry) => entry.date === iso);
    const consumed = Number(dayData?.calories ?? 0);
    const burned = Math.max(0, Math.round(Number(goals.calories ?? 2000) * 0.6));
    return {
      day: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      consumed,
      burned,
    };
  });

  const weeklyConsumed = weeklyPoints.reduce((acc, point) => acc + point.consumed, 0);
  const weeklyBurned = weeklyPoints.reduce((acc, point) => acc + point.burned, 0);

  const lastWeight = weightSeries.at(-1)?.weight ?? Number(goals.start_weight ?? 0);
  const heightMeters = Number(preferences.height_cm ?? 170) / 100;
  const bmi = heightMeters > 0 ? round(lastWeight / (heightMeters * heightMeters), 1) : 0;

  const streakBase = [...calorieSeries]
    .filter((entry) => entry.meals > 0)
    .map((entry) => entry.date)
    .sort();

  let streakCurrent = 0;
  const cursor = new Date();
  while (true) {
    const iso = cursor.toISOString().split("T")[0];
    if (!streakBase.includes(iso)) break;
    streakCurrent += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const derivedBadges = [
    streakCurrent >= 7 ? "week_streak" : null,
    streakCurrent >= 30 ? "month_streak" : null,
    weightSeries.length >= 10 ? "consistent_logger" : null,
  ].filter(Boolean) as string[];

  const badgeList = Array.from(
    new Set([...(badges ?? []).map((badge) => String(badge.badge_code)), ...derivedBadges]),
  );

  const weightChanges = weightChangeSummary(weightSeries);

  return {
    range: normalizedRange,
    currentWeight: lastWeight,
    startWeight: goals.start_weight != null ? Number(goals.start_weight) : null,
    goalWeight: goals.goal_weight != null ? Number(goals.goal_weight) : null,
    targetDate: goals.target_date ? String(goals.target_date) : null,
    weightSeries,
    weightChanges,
    calorieSeries,
    dailyAverageCalories: round(average(calorieSeries.map((entry) => entry.calories)), 0),
    weeklyEnergy: {
      burned: weeklyBurned,
      consumed: weeklyConsumed,
      energy: weeklyConsumed - weeklyBurned,
      daily: weeklyPoints,
    },
    bmi: {
      value: bmi,
      status: bmi >= 30 ? "Obese" : bmi >= 25 ? "Overweight" : bmi >= 18.5 ? "Healthy" : "Underweight",
    },
    streak: {
      current: streakCurrent,
      week: Array.from({ length: 7 }).map((_, i) => {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - (6 - i));
        const iso = day.toISOString().split("T")[0];
        return {
          day: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 1),
          hit: streakBase.includes(iso),
        };
      }),
    },
    badges: badgeList,
    photos: (photos ?? []).map((photo) => ({
      id: String(photo.id),
      imageUrl: String(photo.image_url),
      capturedAt: String(photo.captured_at),
    })),
  };
}

async function fetchStateAndProgress(userId: string, date: string, range: string) {
  const supabase = dbClient();
  const [state, progress] = await Promise.all([
    buildDailyState(supabase, userId, date),
    buildProgress(supabase, userId, range),
  ]);

  return { state, progress };
}

// V1 tool: log_meal
export async function logMeal(
  params: {
    name: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    date?: string;
  },
  context?: RequestContext,
) {
  const { name, calories, protein = 0, carbs = 0, fats = 0 } = params;
  if (!name || Number.isNaN(Number(calories))) {
    return { success: false, error: "name and calories are required" };
  }

  const identity = await resolveIdentity(context);
  const loggedDate = normalizeDate(params.date);

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(loggedDate);
    state.meals.push({
      id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: String(name),
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      timestamp: new Date().toISOString(),
    });
    state.totalCalories = state.meals.reduce((acc, meal) => acc + meal.calories, 0);
    state.totalProtein = state.meals.reduce((acc, meal) => acc + meal.protein, 0);
    state.totalCarbs = state.meals.reduce((acc, meal) => acc + meal.carbs, 0);
    state.totalFats = state.meals.reduce((acc, meal) => acc + meal.fats, 0);
    await legacySaveState(state);
    return {
      success: true,
      state,
      mode: identity.authenticated ? "authenticated" : "demo",
      message: `Logged ${name}. Total today: ${state.totalCalories}/${state.goals.calories} calories.`,
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  await ensureGoals(supabase, userId);
  await ensurePreferences(supabase, userId);

  const { error: insertError } = await supabase.from("meals").insert({
    user_id: userId,
    meal_name: String(name),
    calories: Number(calories) || 0,
    protein: Number(protein) || 0,
    carbs: Number(carbs) || 0,
    fats: Number(fats) || 0,
    logged_date: loggedDate,
    consumed_at: new Date().toISOString(),
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  await recalcDailyTotals(supabase, userId, loggedDate);

  const state = await buildDailyState(supabase, userId, loggedDate);

  return {
    success: true,
    state,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: `Logged ${name}. Total today: ${state.totalCalories}/${state.goals.calories} calories.`,
  };
}

// V1 tool: sync_state
export async function syncState(
  params: { date?: string; range?: string; page?: string } = {},
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  const date = normalizeDate(params.date);
  const range = String(params.range ?? "90D").toUpperCase();

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(date);
    const progress = legacyProgressFromState(state, range);
    return {
      success: true,
      state,
      progress,
      mode: identity.authenticated ? "authenticated" : "demo",
      page: params.page ?? "home",
    };
  }

  const userId = identity.userId;

  const { state, progress } = await fetchStateAndProgress(userId, date, range);

  return {
    success: true,
    state,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
    page: params.page ?? "home",
  };
}

// V1 tool: delete_meal
export async function deleteMeal(params: { meal_id: string; date?: string }, context?: RequestContext) {
  if (!params.meal_id) {
    return { success: false, error: "meal_id is required" };
  }

  const identity = await resolveIdentity(context);
  const date = normalizeDate(params.date);

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(date);
    const nextMeals = state.meals.filter((meal) => meal.id !== params.meal_id);
    if (nextMeals.length === state.meals.length) {
      return { success: false, error: "Meal not found" };
    }
    state.meals = nextMeals;
    state.totalCalories = state.meals.reduce((acc, meal) => acc + meal.calories, 0);
    state.totalProtein = state.meals.reduce((acc, meal) => acc + meal.protein, 0);
    state.totalCarbs = state.meals.reduce((acc, meal) => acc + meal.carbs, 0);
    state.totalFats = state.meals.reduce((acc, meal) => acc + meal.fats, 0);
    await legacySaveState(state);
    return {
      success: true,
      state,
      mode: identity.authenticated ? "authenticated" : "demo",
      message: "Meal deleted",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  const { error } = await supabase
    .from("meals")
    .delete()
    .eq("user_id", userId)
    .or(`id.eq.${params.meal_id},legacy_meal_id.eq.${params.meal_id}`);

  if (error) {
    return { success: false, error: error.message };
  }

  await recalcDailyTotals(supabase, userId, date);
  const state = await buildDailyState(supabase, userId, date);

  return {
    success: true,
    state,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Meal deleted",
  };
}

// V1+V2 tool: update_goals
export async function updateGoals(
  params: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    goal_weight?: number;
    start_weight?: number;
    target_date?: string;
    date?: string;
  },
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  const date = normalizeDate(params.date);

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(date);
    if (params.calories != null) state.goals.calories = Number(params.calories);
    if (params.protein != null) state.goals.protein = Number(params.protein);
    if (params.carbs != null) state.goals.carbs = Number(params.carbs);
    if (params.fats != null) state.goals.fats = Number(params.fats);
    if (params.goal_weight != null) state.goals.goalWeight = Number(params.goal_weight);
    if (params.start_weight != null) state.goals.startWeight = Number(params.start_weight);
    if (params.target_date != null) state.goals.targetDate = String(params.target_date);
    await legacySaveState(state);
    return {
      success: true,
      state,
      mode: identity.authenticated ? "authenticated" : "demo",
      message: "Goals updated",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  const existing = await ensureGoals(supabase, userId);

  const patch = {
    user_id: userId,
    calories: params.calories != null ? Number(params.calories) : Number(existing.calories),
    protein: params.protein != null ? Number(params.protein) : Number(existing.protein),
    carbs: params.carbs != null ? Number(params.carbs) : Number(existing.carbs),
    fats: params.fats != null ? Number(params.fats) : Number(existing.fats),
    goal_weight:
      params.goal_weight != null
        ? Number(params.goal_weight)
        : existing.goal_weight != null
          ? Number(existing.goal_weight)
          : null,
    start_weight:
      params.start_weight != null
        ? Number(params.start_weight)
        : existing.start_weight != null
          ? Number(existing.start_weight)
          : null,
    target_date: params.target_date ?? existing.target_date,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("nutrition_goals")
    .upsert(patch, { onConflict: "user_id" });

  if (error) {
    return { success: false, error: error.message };
  }

  await recalcDailyTotals(supabase, userId, date);
  const state = await buildDailyState(supabase, userId, date);

  return {
    success: true,
    state,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Goals updated",
  };
}

// V2 tool: log_weight
export async function logWeight(
  params: { weight: number; date?: string; range?: string },
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  if (!identity.authenticated && !ALLOW_DEMO_MODE) {
    return authRequiredResult(identity.authError ?? "Please authenticate before logging weight");
  }

  if (params.weight == null || Number.isNaN(Number(params.weight))) {
    return { success: false, error: "weight is required" };
  }

  const entryDate = normalizeDate(params.date);
  const range = String(params.range ?? "90D").toUpperCase();

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(entryDate);
    state.goals.startWeight = Number(params.weight);
    await legacySaveState(state);
    return {
      success: true,
      progress: legacyProgressFromState(state, range),
      mode: identity.authenticated ? "authenticated" : "demo",
      message: "Weight logged",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  const { error } = await supabase.from("weight_entries").upsert(
    {
      user_id: userId,
      entry_date: entryDate,
      weight: Number(params.weight),
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_date" },
  );

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase.from("badge_events").upsert(
    {
      user_id: userId,
      badge_code: "weight_logged",
    },
    { onConflict: "user_id,badge_code" },
  );

  const progress = await buildProgress(supabase, userId, range);

  return {
    success: true,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Weight logged",
  };
}

// V2 tool: get_progress
export async function getProgress(
  params: { range?: string } = {},
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  const range = String(params.range ?? "90D").toUpperCase();

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(todayIsoDate());
    return {
      success: true,
      progress: legacyProgressFromState(state, range),
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  const progress = await buildProgress(supabase, userId, range);

  return {
    success: true,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

// V2 tool: update_preferences
export async function updatePreferences(
  params: {
    unit_weight?: "kg" | "lb";
    unit_energy?: "kcal" | "kj";
    language?: string;
    reminder_enabled?: boolean;
    reminder_time?: string;
    theme_preset?: string;
    streak_badge_notifications?: boolean;
    height_cm?: number;
  },
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  if (!identity.authenticated && !ALLOW_DEMO_MODE) {
    return authRequiredResult(identity.authError ?? "Please authenticate before updating preferences");
  }

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(todayIsoDate());
    if (params.unit_weight) state.preferences.unitWeight = params.unit_weight;
    if (params.unit_energy) state.preferences.unitEnergy = params.unit_energy;
    if (params.language) state.preferences.language = params.language;
    if (params.reminder_enabled != null) state.preferences.reminderEnabled = Boolean(params.reminder_enabled);
    if (params.reminder_time) state.preferences.reminderTime = params.reminder_time;
    if (params.theme_preset) state.preferences.themePreset = params.theme_preset;
    if (params.streak_badge_notifications != null) {
      state.preferences.streakBadgeNotifications = Boolean(params.streak_badge_notifications);
    }
    if (params.height_cm != null) state.preferences.heightCm = Number(params.height_cm);
    await legacySaveState(state);
    return {
      success: true,
      preferences: state.preferences,
      mode: identity.authenticated ? "authenticated" : "demo",
      message: "Preferences updated",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();
  const existing = await ensurePreferences(supabase, userId);

  const patch = {
    user_id: userId,
    unit_weight: params.unit_weight ?? existing.unit_weight,
    unit_energy: params.unit_energy ?? existing.unit_energy,
    language: params.language ?? existing.language,
    reminder_enabled:
      params.reminder_enabled != null
        ? Boolean(params.reminder_enabled)
        : Boolean(existing.reminder_enabled),
    reminder_time: params.reminder_time ?? existing.reminder_time,
    theme_preset: params.theme_preset ?? existing.theme_preset,
    streak_badge_notifications:
      params.streak_badge_notifications != null
        ? Boolean(params.streak_badge_notifications)
        : Boolean(existing.streak_badge_notifications),
    height_cm: params.height_cm != null ? Number(params.height_cm) : Number(existing.height_cm),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    preferences: data,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Preferences updated",
  };
}

// V2 tool: upload_progress_photo
export async function uploadProgressPhoto(
  params: { image_url: string; note?: string },
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  if (!identity.authenticated && !ALLOW_DEMO_MODE) {
    return authRequiredResult(identity.authError ?? "Please authenticate before uploading a photo");
  }

  if (!params.image_url) {
    return { success: false, error: "image_url is required" };
  }

  if (!(await isSchemaReady())) {
    return {
      success: true,
      photo: {
        id: `legacy_photo_${Date.now()}`,
        image_url: params.image_url,
        note: params.note ?? null,
        captured_at: new Date().toISOString(),
      },
      mode: identity.authenticated ? "authenticated" : "demo",
      message: "Progress photo saved (legacy mode)",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();
  const { data, error } = await supabase
    .from("progress_photos")
    .insert({
      user_id: userId,
      image_url: params.image_url,
      note: params.note ?? null,
      captured_at: new Date().toISOString(),
    })
    .select("id, image_url, note, captured_at")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    photo: data,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Progress photo saved",
  };
}

// V3 tool: run_daily_checkin
export async function runDailyCheckin(
  params: { date?: string; range?: string } = {},
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);
  const date = normalizeDate(params.date);
  const range = String(params.range ?? "90D").toUpperCase();

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(date);
    const progress = legacyProgressFromState(state, range);
    const recommendations = state.totalCalories > state.goals.calories
      ? ["You are above your daily calorie goal. Keep your next meal lighter."]
      : ["You are on track today. Keep meal logging consistent."];
    return {
      success: true,
      checkin: {
        date,
        calories: { current: state.totalCalories, goal: state.goals.calories },
        protein: { current: state.totalProtein, goal: state.goals.protein },
        streak: progress.streak.current,
        recommendations,
      },
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const userId = identity.userId;

  const { state, progress } = await fetchStateAndProgress(userId, date, range);
  const recommendations: string[] = [];

  if (state.totalCalories < state.goals.calories * 0.5) {
    recommendations.push("You are well below your calorie target today; consider adding a protein-focused meal.");
  }
  if (state.totalProtein < state.goals.protein * 0.7) {
    recommendations.push("Protein is low versus your goal; add a high-protein snack to improve recovery.");
  }
  if (state.totalCalories > state.goals.calories) {
    recommendations.push("You are above your calorie target. Keep the next meal lighter and protein-forward.");
  }
  if (recommendations.length === 0) {
    recommendations.push("You are tracking well today. Stay consistent with hydration and meal timing.");
  }

  return {
    success: true,
    checkin: {
      date,
      calories: {
        current: state.totalCalories,
        goal: state.goals.calories,
      },
      protein: {
        current: state.totalProtein,
        goal: state.goals.protein,
      },
      streak: progress.streak.current,
      recommendations,
    },
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

// V3 tool: run_weekly_review
export async function runWeeklyReview(
  _params: Record<string, never> = {},
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(todayIsoDate());
    return {
      success: true,
      review: {
        period: "last_7_days",
        consumedAverage: state.totalCalories,
        burnedAverage: Math.round(state.goals.calories * 0.6),
        weightDelta7: 0,
        insights: ["Legacy mode: weekly review is simplified until SQL migration is applied."],
        suggestion: "Run SQL migration for full analytics.",
      },
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();
  const progress = await buildProgress(supabase, userId, "90D");

  const lastWeek = progress.weeklyEnergy.daily;
  const consumedAverage = round(average(lastWeek.map((point) => point.consumed)), 0);
  const burnedAverage = round(average(lastWeek.map((point) => point.burned)), 0);
  const weightDelta7 = progress.weightChanges.find((item) => item.label === "7 day")?.delta ?? 0;

  const insights: string[] = [];
  if (consumedAverage > burnedAverage) {
    insights.push("Average weekly intake is above estimated burn, which supports weight gain.");
  } else if (consumedAverage < burnedAverage) {
    insights.push("Average weekly intake is below estimated burn, which supports weight loss.");
  } else {
    insights.push("Average intake and burn are balanced this week.");
  }

  if (weightDelta7 > 0.3) {
    insights.push("Weight trend increased over 7 days. Review calorie-dense meals and sodium swings.");
  } else if (weightDelta7 < -0.3) {
    insights.push("Weight trend decreased over 7 days. Keep protein intake stable to retain muscle.");
  } else {
    insights.push("Weight remained relatively stable over the last 7 days.");
  }

  return {
    success: true,
    review: {
      period: "last_7_days",
      consumedAverage,
      burnedAverage,
      weightDelta7,
      insights,
      suggestion: "Use suggest_goal_adjustments for a numeric goal recommendation.",
    },
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

// V3 tool: suggest_goal_adjustments
export async function suggestGoalAdjustments(
  _params: Record<string, never> = {},
  context?: RequestContext,
) {
  const identity = await resolveIdentity(context);

  if (!(await isSchemaReady())) {
    const state = await legacyGetState(todayIsoDate());
    return {
      success: true,
      suggestion: {
        currentGoals: {
          calories: state.goals.calories,
          protein: state.goals.protein,
          carbs: state.goals.carbs,
          fats: state.goals.fats,
        },
        proposedGoals: {
          calories: state.goals.calories,
          protein: state.goals.protein,
          carbs: state.goals.carbs,
          fats: state.goals.fats,
        },
        rationale: {
          weeklyAverageCalories: state.totalCalories,
          weightDelta30: 0,
          note: "Legacy mode returns current goals. Run SQL migration for adaptive recommendations.",
        },
      },
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const userId = identity.userId;
  const supabase = dbClient();

  const [goals, progress] = await Promise.all([
    ensureGoals(supabase, userId),
    buildProgress(supabase, userId, "90D"),
  ]);

  const weeklyAverageCalories = progress.dailyAverageCalories;
  const weightDelta30 = progress.weightChanges.find((item) => item.label === "30 day")?.delta ?? 0;

  let suggestedCalories = Number(goals.calories ?? DEFAULT_GOALS.calories);
  if (weightDelta30 > 1.5) {
    suggestedCalories = Math.max(1400, suggestedCalories - 150);
  } else if (weightDelta30 < -1.5) {
    suggestedCalories = Math.min(3800, suggestedCalories + 150);
  }

  const targetProtein = Math.max(90, Math.round((progress.currentWeight || 70) * 1.8));

  return {
    success: true,
    suggestion: {
      currentGoals: {
        calories: Number(goals.calories),
        protein: Number(goals.protein),
        carbs: Number(goals.carbs),
        fats: Number(goals.fats),
      },
      proposedGoals: {
        calories: suggestedCalories,
        protein: targetProtein,
        carbs: Number(goals.carbs),
        fats: Number(goals.fats),
      },
      rationale: {
        weeklyAverageCalories,
        weightDelta30,
        note: "Adjustments are recommendation-only. Apply with update_goals to persist.",
      },
    },
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}
