import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { logEvent } from "./logging.ts";

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  timestamp: string;
  estimationNotes?: string | null;
}

export interface AgentNote {
  key: string;
  value: string;
  updatedAt: string;
}

export interface OnboardingGuide {
  isNewUser: boolean;
  summary: string;
  suggestedPrompt: string;
  starterPrompts: string[];
}

export interface DailyState {
  date: string;
  meals: Meal[];
  agentNotes: AgentNote[];
  onboarding: OnboardingGuide;
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
  timeZone?: string | null;
  resource?: string | null;
  source?: string | null;
  widgetVersion?: string | null;
};

type AccessTokenClaims = {
  aud: string[];
  scope: string[];
  clientId?: string | null;
};

type UserIdentity = {
  userId: string;
  authenticated: boolean;
  authError?: string;
  tokenClaims?: AccessTokenClaims | null;
};

type DbClient = ReturnType<typeof createClient>;

type WeightPoint = {
  date: string;
  weight: number;
};

type RecentMealSummary = {
  name: string;
  frequency: number;
  lastLoggedAt: string;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFats: number;
};

type DailyTotalSnapshot = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  meals: number;
};

type RecentMealPatternSnapshot = {
  loggedDate: string;
  consumedAt: string;
};

type CoachingPattern = {
  code:
    | "protein_deficit"
    | "calorie_overconsumption"
    | "skipped_meals"
    | "late_night_eating"
    | "weight_plateau"
    | "weight_goal_projection"
    | "streak_milestone"
    | "macro_imbalance";
  message: string;
  action: string;
  severity: "positive" | "warning";
  badgeCode?: string;
};

type GoalProjection = {
  direction: "loss" | "gain";
  weeklyRate: number;
  daysToGoal: number;
  projectedDate: string;
};

type AnalyticsEventName =
  | "dashboard_open"
  | "meal_logged"
  | "weight_logged"
  | "daily_checkin_run"
  | "weekly_review_run"
  | "goals_updated"
  | "preferences_updated"
  | "write_attempt"
  | "write_rate_limited"
  | "tool_error";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const ALLOW_DEMO_MODE = Deno.env.get("ALLOW_DEMO_MODE") !== "false";
const DEFAULT_TIMEZONE = Deno.env.get("MCP_DEFAULT_TIMEZONE")?.trim() || "America/New_York";
const REQUIRED_OAUTH_SCOPE = "openid";
const SUPABASE_DEFAULT_AUDIENCE = "authenticated";

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

const STARTER_PROMPTS = [
  "Show my dashboard.",
  "Log breakfast: Greek yogurt, berries, and granola for 350 calories.",
  "Log my weight as 75.8 kg.",
  "Run my daily check-in.",
  "Run my weekly review.",
];

const WRITE_RATE_LIMIT_WINDOW_MS = 10_000;
const WRITE_RATE_LIMIT_MAX_ATTEMPTS = 3;
const WRITE_RATE_LIMIT_RETRY_SECONDS = WRITE_RATE_LIMIT_WINDOW_MS / 1000;

// --- Validation helpers ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ID_RE = /^meal_\d+_[a-z0-9]+$/;
const NOTE_KEY_RE = /^[a-z0-9]+(?::[a-z0-9_-]+)*$/;

function clampPositive(value: unknown, fallback: number, max: number): number {
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) return fallback;
  return Math.min(num, max);
}

function sanitizeText(value: unknown, maxLen: number): string {
  const str = String(value ?? "").replace(/[<>"'&]/g, "");
  return str.slice(0, maxLen);
}

function sanitizeNoteKey(value: unknown, maxLen: number): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "")
    .replace(/:{2,}/g, ":")
    .replace(/^[:_-]+|[:_-]+$/g, "")
    .slice(0, maxLen);
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// --- Range / constants ---

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

function resolveTimeZone(raw?: string | null) {
  const candidate = raw?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/New_York";
  }
}

function isoDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Failed to format date in timezone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split("T")[0];
}

function weekdayLabel(isoDate: string, timeZone: string) {
  return new Date(`${isoDate}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone,
  });
}

function todayIsoDate(timeZone?: string | null) {
  return isoDateInTimeZone(new Date(), resolveTimeZone(timeZone));
}

function normalizeDate(raw?: string, timeZone?: string | null): string {
  if (!raw) return todayIsoDate(timeZone);
  if (isValidIsoDate(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate(timeZone);
  return isoDateInTimeZone(parsed, resolveTimeZone(timeZone));
}

function mealCountLabel(count: number) {
  return `${count} meal${count === 1 ? "" : "s"}`;
}

function summarizeDailyCalories(state: DailyState) {
  return `Today is ${Math.round(state.totalCalories)}/${Math.round(state.goals.calories)} calories across ${mealCountLabel(state.meals.length)}.`;
}

function summarizeGoalChanges(
  params: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    goal_weight?: number;
    start_weight?: number;
    target_date?: string;
  },
  goals: DailyState["goals"],
) {
  const details: string[] = [];
  if (params.calories != null) details.push(`calories ${Math.round(goals.calories)} kcal`);
  if (params.protein != null) details.push(`protein ${Math.round(goals.protein)} g`);
  if (params.carbs != null) details.push(`carbs ${Math.round(goals.carbs)} g`);
  if (params.fats != null) details.push(`fats ${Math.round(goals.fats)} g`);
  if (params.goal_weight != null && goals.goalWeight != null) details.push(`goal weight ${goals.goalWeight.toFixed(1)} kg`);
  if (params.start_weight != null && goals.startWeight != null) details.push(`start weight ${goals.startWeight.toFixed(1)} kg`);
  if (params.target_date != null && goals.targetDate) details.push(`target date ${goals.targetDate}`);
  return details;
}

function summarizePreferenceChanges(
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
  preferences: Record<string, unknown>,
) {
  const details: string[] = [];
  if (params.unit_weight != null) details.push(`weight unit ${String(preferences.unit_weight ?? params.unit_weight)}`);
  if (params.unit_energy != null) details.push(`energy unit ${String(preferences.unit_energy ?? params.unit_energy)}`);
  if (params.language != null) details.push(`language ${String(preferences.language ?? params.language)}`);
  if (params.reminder_enabled != null) details.push(`reminders ${Boolean(preferences.reminder_enabled) ? "on" : "off"}`);
  if (params.reminder_time != null) details.push(`reminder time ${String(preferences.reminder_time ?? params.reminder_time)}`);
  if (params.theme_preset != null) details.push(`theme ${String(preferences.theme_preset ?? params.theme_preset)}`);
  if (params.streak_badge_notifications != null) {
    details.push(`badge notifications ${Boolean(preferences.streak_badge_notifications) ? "on" : "off"}`);
  }
  if (params.height_cm != null) details.push(`height ${Math.round(Number(preferences.height_cm ?? params.height_cm))} cm`);
  return details;
}

async function recordAnalyticsEvent(
  supabase: DbClient,
  {
    userId,
    eventName,
    toolName,
    page,
    failureClass,
    detail,
    context,
  }: {
    userId: string;
    eventName: AnalyticsEventName;
    toolName: string;
    page?: string | null;
    failureClass?: string | null;
    detail?: Record<string, unknown>;
    context?: RequestContext;
  },
) {
  try {
    const { error } = await supabase.from("analytics_events").insert({
      user_id: userId,
      event_name: eventName,
      tool_name: toolName,
      page: page ?? null,
      source: context?.source ?? "direct",
      widget_version: context?.widgetVersion ?? null,
      failure_class: failureClass ?? null,
      detail: detail ?? {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      logEvent("error", "analytics.record_failed", {
        userId,
        eventName,
        toolName,
        page: page ?? null,
        source: context?.source ?? "direct",
        widgetVersion: context?.widgetVersion ?? null,
        error,
      });
    }
  } catch (error) {
    logEvent("error", "analytics.record_failed", {
      userId,
      eventName,
      toolName,
      page: page ?? null,
      source: context?.source ?? "direct",
      widgetVersion: context?.widgetVersion ?? null,
      error,
    });
  }
}

function rateLimitedResult() {
  return {
    success: false,
    error: "Too many write actions. Try again in a few seconds.",
    failureClass: "rate_limited",
    retryAfterSeconds: WRITE_RATE_LIMIT_RETRY_SECONDS,
  };
}

async function enforceWriteRateLimit(
  supabase: DbClient,
  userId: string,
  toolName: string,
  context?: RequestContext,
) {
  const windowStart = new Date(Date.now() - WRITE_RATE_LIMIT_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_name, created_at")
    .eq("user_id", userId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (error) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName,
      failureClass: "db_error",
      detail: { reason: error.message, phase: "rate_limit_lookup" },
      context,
    });
    return { success: false, error: error.message, failureClass: "db_error" } as const;
  }

  const attemptsInWindow = (data ?? []).filter((row) => String((row as Record<string, unknown>).event_name ?? "") === "write_attempt").length;

  if (attemptsInWindow >= WRITE_RATE_LIMIT_MAX_ATTEMPTS) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "write_rate_limited",
      toolName,
      failureClass: "rate_limited",
      detail: {
        attemptsInWindow,
        maxAttempts: WRITE_RATE_LIMIT_MAX_ATTEMPTS,
        windowSeconds: WRITE_RATE_LIMIT_RETRY_SECONDS,
      },
      context,
    });
    return rateLimitedResult();
  }

  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "write_attempt",
    toolName,
    detail: {
      attemptsInWindow: attemptsInWindow + 1,
      maxAttempts: WRITE_RATE_LIMIT_MAX_ATTEMPTS,
      windowSeconds: WRITE_RATE_LIMIT_RETRY_SECONDS,
    },
    context,
  });

  return null;
}

export const __testables = {
  UUID_RE,
  LEGACY_ID_RE,
  NOTE_KEY_RE,
  clampPositive,
  sanitizeText,
  sanitizeNoteKey,
  isValidIsoDate,
  resolveTimeZone,
  isoDateInTimeZone,
  addDaysToIsoDate,
  normalizeDate,
  buildWeightGoalProjection,
  detectCoachingPatterns,
  enforceWriteRateLimit,
  hasRequiredScope,
  hasExpectedAudience,
  parseJwtClaims,
  rateLimitedResult,
};

function parseBearer(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function parseJwtClaims(token: string): AccessTokenClaims | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(atob(segments[1].replace(/-/g, "+").replace(/_/g, "/")));
    const rawAud = payload?.aud;
    const rawScope = payload?.scope ?? payload?.scp;
    const rawClientId = payload?.client_id;
    const aud = Array.isArray(rawAud)
      ? rawAud.map((value) => String(value).trim()).filter(Boolean)
      : rawAud
        ? [String(rawAud).trim()].filter(Boolean)
        : [];
    const scope = Array.isArray(rawScope)
      ? rawScope.map((value) => String(value).trim()).filter(Boolean)
      : typeof rawScope === "string"
        ? rawScope.split(/\s+/).map((value) => value.trim()).filter(Boolean)
        : [];

    return {
      aud,
      scope,
      clientId: rawClientId ? String(rawClientId).trim() : null,
    };
  } catch {
    return null;
  }
}

function hasRequiredScope(identity: UserIdentity, requiredScope: string) {
  const scopes = identity.tokenClaims?.scope ?? [];
  if (!requiredScope || scopes.length === 0) {
    return true;
  }
  return scopes.includes(requiredScope);
}

function hasExpectedAudience(identity: UserIdentity, expectedAudience?: string | null) {
  if (!expectedAudience) return true;
  const claims = identity.tokenClaims;
  if (!claims) return false;
  if (claims.aud.includes(expectedAudience)) return true;
  if (claims.aud.includes(SUPABASE_DEFAULT_AUDIENCE)) return true;
  return Boolean(claims.clientId);
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
    tokenClaims: parseJwtClaims(token),
  };
}

function authRequiredResult(
  message = "Authentication required",
  failureClass = "auth_required",
) {
  return {
    success: false,
    authRequired: true,
    error: message,
    failureClass,
  };
}

async function resolveAuthorizedIdentity(
  context: RequestContext | undefined,
  actionDescription: string,
  requiredScope: string,
): Promise<{ identity: UserIdentity; authErrorResult?: ReturnType<typeof authRequiredResult> }> {
  const identity = await resolveIdentity(context);

  if (!identity.authenticated) {
    return {
      identity,
      authErrorResult: !ALLOW_DEMO_MODE
        ? authRequiredResult(identity.authError ?? `Please authenticate before ${actionDescription}`)
        : undefined,
    };
  }

  if (!hasRequiredScope(identity, requiredScope)) {
    return {
      identity,
      authErrorResult: authRequiredResult(
        `Missing required scope: ${requiredScope}`,
        "insufficient_scope",
      ),
    };
  }

  if (!hasExpectedAudience(identity, context?.resource)) {
    return {
      identity,
      authErrorResult: authRequiredResult(
        "Token audience did not match this MCP resource",
        "invalid_token",
      ),
    };
  }

  return { identity };
}

// --- DB helpers ---

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

function mapAgentNote(row: Record<string, unknown>): AgentNote {
  return {
    key: String(row.note_key ?? ""),
    value: String(row.note_value ?? ""),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function fetchAgentNotes(
  supabase: DbClient,
  userId: string,
  orderBy: "note_key" | "updated_at" = "updated_at",
  ascending = false,
) {
  const { data, error } = await supabase
    .from("agent_notes")
    .select("note_key, note_value, updated_at")
    .eq("user_id", userId)
    .order(orderBy, { ascending });

  if (error) {
    throw new Error(`Failed to fetch agent notes: ${error.message}`);
  }

  return (data ?? []).map((row) => mapAgentNote(row as Record<string, unknown>));
}

async function fetchRecentMealCount(supabase: DbClient, userId: string, timeZone?: string | null) {
  const startDate = rangeStart("30D", timeZone);
  const { data, error } = await supabase
    .from("meals")
    .select("meal_name")
    .eq("user_id", userId)
    .gte("logged_date", startDate);

  if (error) {
    throw new Error(`Failed to fetch recent meals: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => String((row as Record<string, unknown>).meal_name ?? ""))).size;
}

async function fetchWeightEntryCount(supabase: DbClient, userId: string) {
  const { data, error } = await supabase
    .from("weight_entries")
    .select("entry_date")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch weight entries: ${error.message}`);
  }

  return (data ?? []).length;
}

function buildOnboardingGuide(params: {
  recentMealCount: number;
  weightEntryCount: number;
  agentNoteCount: number;
}): OnboardingGuide {
  const isNewUser = params.recentMealCount === 0 && params.weightEntryCount === 0;

  return {
    isNewUser,
    summary: isNewUser
      ? "Ask CalGPT in chat to log a first meal, log a first weight, or show your dashboard."
      : "Ask CalGPT in chat to log meals, log weight, update goals, or run a coaching review.",
    suggestedPrompt: isNewUser
      ? STARTER_PROMPTS[1]
      : params.agentNoteCount > 0
        ? "Show my dashboard and keep my saved preferences in mind."
        : "Show my dashboard and summarize my progress.",
    starterPrompts: STARTER_PROMPTS,
  };
}

async function fetchRecentMeals(
  supabase: DbClient,
  userId: string,
  limit = 20,
): Promise<RecentMealSummary[]> {
  const { data, error } = await supabase
    .from("meals")
    .select("meal_name, calories, protein, carbs, fats, consumed_at")
    .eq("user_id", userId)
    .order("consumed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch recent meals: ${error.message}`);
  }

  const grouped = new Map<
    string,
    {
      name: string;
      frequency: number;
      lastLoggedAt: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    }
  >();

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const name = String(record.meal_name ?? "").trim();
    if (!name) continue;

    const existing = grouped.get(name);
    if (existing) {
      existing.frequency += 1;
      existing.calories += Number(record.calories ?? 0);
      existing.protein += Number(record.protein ?? 0);
      existing.carbs += Number(record.carbs ?? 0);
      existing.fats += Number(record.fats ?? 0);
      const consumedAt = String(record.consumed_at ?? existing.lastLoggedAt);
      if (consumedAt > existing.lastLoggedAt) {
        existing.lastLoggedAt = consumedAt;
      }
      continue;
    }

    grouped.set(name, {
      name,
      frequency: 1,
      lastLoggedAt: String(record.consumed_at ?? new Date().toISOString()),
      calories: Number(record.calories ?? 0),
      protein: Number(record.protein ?? 0),
      carbs: Number(record.carbs ?? 0),
      fats: Number(record.fats ?? 0),
    });
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      if (right.frequency !== left.frequency) {
        return right.frequency - left.frequency;
      }
      return right.lastLoggedAt.localeCompare(left.lastLoggedAt);
    })
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map((meal) => ({
      name: meal.name,
      frequency: meal.frequency,
      lastLoggedAt: meal.lastLoggedAt,
      avgCalories: round(meal.calories / meal.frequency, 0),
      avgProtein: round(meal.protein / meal.frequency, 1),
      avgCarbs: round(meal.carbs / meal.frequency, 1),
      avgFats: round(meal.fats / meal.frequency, 1),
    }));
}

function isVegetarianPreference(agentNotes: AgentNote[]) {
  return agentNotes.some((note) => {
    const text = noteText(note);
    return text.includes("vegetarian") || text.includes("vegan");
  });
}

async function fetchRecentDailyTotals(
  supabase: DbClient,
  userId: string,
  timeZone?: string | null,
  days = 7,
): Promise<DailyTotalSnapshot[]> {
  const today = todayIsoDate(timeZone);
  const startDate = addDaysToIsoDate(today, -(days - 1));
  const { data, error } = await supabase
    .from("daily_totals")
    .select("entry_date, total_calories, total_protein, total_carbs, total_fats, meal_count")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", today)
    .order("entry_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch recent daily totals: ${error.message}`);
  }

  const byDate = new Map(
    (data ?? []).map((row) => [
      String((row as Record<string, unknown>).entry_date ?? ""),
      {
        date: String((row as Record<string, unknown>).entry_date ?? ""),
        calories: Number((row as Record<string, unknown>).total_calories ?? 0),
        protein: Number((row as Record<string, unknown>).total_protein ?? 0),
        carbs: Number((row as Record<string, unknown>).total_carbs ?? 0),
        fats: Number((row as Record<string, unknown>).total_fats ?? 0),
        meals: Number((row as Record<string, unknown>).meal_count ?? 0),
      },
    ]),
  );

  return Array.from({ length: days }).map((_, index) => {
    const iso = addDaysToIsoDate(startDate, index);
    return byDate.get(iso) ?? { date: iso, calories: 0, protein: 0, carbs: 0, fats: 0, meals: 0 };
  });
}

async function fetchRecentMealPatterns(
  supabase: DbClient,
  userId: string,
  timeZone?: string | null,
  days = 7,
): Promise<RecentMealPatternSnapshot[]> {
  const today = todayIsoDate(timeZone);
  const startDate = addDaysToIsoDate(today, -(days - 1));
  const { data, error } = await supabase
    .from("meals")
    .select("logged_date, consumed_at")
    .eq("user_id", userId)
    .gte("logged_date", startDate)
    .lte("logged_date", today)
    .order("consumed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch recent meal patterns: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    loggedDate: String((row as Record<string, unknown>).logged_date ?? ""),
    consumedAt: String((row as Record<string, unknown>).consumed_at ?? ""),
  }));
}

function hourInTimeZone(timestamp: string, timeZone: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(parsed)
    .find((part) => part.type === "hour")?.value;
  return hour ? Number(hour) : null;
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function buildWeightGoalProjection(
  weightSeries: WeightPoint[],
  goals: DailyState["goals"],
): GoalProjection | null {
  const goalWeight = goals.goalWeight;
  if (goalWeight == null || weightSeries.length < 2) {
    return null;
  }

  const latest = weightSeries.at(-1);
  if (!latest) {
    return null;
  }

  const recentWindow = weightSeries.slice(-30);
  const baseline = recentWindow[0];
  if (!baseline || baseline.date === latest.date) {
    return null;
  }

  const elapsedDays = Math.max(1, Math.round(
    (new Date(`${latest.date}T12:00:00.000Z`).getTime() - new Date(`${baseline.date}T12:00:00.000Z`).getTime()) /
      86400000,
  ));
  const delta = latest.weight - baseline.weight;
  const direction: GoalProjection["direction"] = goalWeight < latest.weight ? "loss" : "gain";
  const ratePerDay = delta / elapsedDays;
  const movingTowardGoal =
    (direction === "loss" && ratePerDay < -0.01) ||
    (direction === "gain" && ratePerDay > 0.01);

  if (!movingTowardGoal) {
    return null;
  }

  const remaining = Math.abs(goalWeight - latest.weight);
  const daysToGoal = Math.round(remaining / Math.abs(ratePerDay));
  if (!Number.isFinite(daysToGoal) || daysToGoal <= 0 || daysToGoal > 730) {
    return null;
  }

  return {
    direction,
    weeklyRate: round(Math.abs(ratePerDay) * 7, 2),
    daysToGoal,
    projectedDate: addDaysToIsoDate(latest.date, daysToGoal),
  };
}

function detectCoachingPatterns(args: {
  goals: DailyState["goals"],
  recentDays: DailyTotalSnapshot[];
  recentMeals: RecentMealPatternSnapshot[];
  weightSeries: WeightPoint[];
  streakCurrent: number;
  timeZone: string;
}) {
  const { goals, recentDays, recentMeals, weightSeries, streakCurrent, timeZone } = args;
  const patterns: CoachingPattern[] = [];
  const proteinShortDays =
    goals.protein > 0 ? recentDays.filter((day) => day.protein < goals.protein * 0.7) : [];
  const skippedDays = recentDays.filter((day) => day.meals === 0);
  const overeatingDays =
    goals.calories > 0 ? recentDays.filter((day) => day.calories > goals.calories * 1.1) : [];
  const lateNightMeals = recentMeals.filter((meal) => {
    const localHour = hourInTimeZone(meal.consumedAt, timeZone);
    return localHour != null && localHour >= 21;
  });

  if (proteinShortDays.length >= 4) {
    patterns.push({
      code: "protein_deficit",
      severity: "warning",
      message: `Protein stayed below 70% of your ${goals.protein}g target on ${proteinShortDays.length} of the last 7 days.`,
      action: "Add a repeatable protein anchor such as yogurt, eggs, tofu, or a shake earlier in the day.",
    });
  }

  if (overeatingDays.length >= 3) {
    const averageOverage = round(
      average(overeatingDays.map((day) => day.calories - goals.calories)),
      0,
    );
    patterns.push({
      code: "calorie_overconsumption",
      severity: "warning",
      message: `Calories were above 110% of target on ${overeatingDays.length} of the last 7 days, by an average of ${averageOverage} calories.`,
      action: "Tighten one high-calorie meal this week instead of trying to cut every meal at once.",
    });
  }

  if (skippedDays.length > 0) {
    const skippedLabels = skippedDays.map((day) => weekdayLabel(day.date, timeZone));
    patterns.push({
      code: "skipped_meals",
      severity: "warning",
      message: `You skipped logging meals on ${joinLabels(skippedLabels)}, which can make trends noisier.`,
      action: "Set up one default meal or meal-prep fallback so low-structure days still get logged.",
    });
  }

  if (lateNightMeals.length >= 2) {
    patterns.push({
      code: "late_night_eating",
      severity: "warning",
      message: `${lateNightMeals.length} meals were logged after 21:00 in the last 7 days, which can make sleep and digestion harder to manage.`,
      action: "Front-load more calories earlier in the day and keep a lighter late option ready if evenings run long.",
    });
  }

  const macroPatterns = ([
    { key: "protein", label: "Protein" },
    { key: "carbs", label: "Carbs" },
    { key: "fats", label: "Fats" },
  ] as const)
    .map((macro) => ({
      ...macro,
      goal: goals[macro.key],
      count:
        goals[macro.key] > 0
          ? recentDays.filter((day) => day[macro.key] > goals[macro.key] * 1.5).length
          : 0,
    }))
    .sort((left, right) => right.count - left.count);

  const dominantMacro = macroPatterns[0];
  if (dominantMacro && dominantMacro.goal > 0 && dominantMacro.count >= 3) {
    patterns.push({
      code: "macro_imbalance",
      severity: "warning",
      message: `${dominantMacro.label} exceeded 150% of goal on ${dominantMacro.count} of the last 7 days.`,
      action: `Rebalance around your ${dominantMacro.label.toLowerCase()} target by pairing that macro with leaner meals for the next few days.`,
    });
  }

  const recentWeightWindow = weightSeries.filter((point) => {
    const start = addDaysToIsoDate(todayIsoDate(timeZone), -13);
    return point.date >= start;
  });

  if (recentWeightWindow.length >= 14) {
    const weights = recentWeightWindow.map((point) => point.weight);
    const variance = round(Math.max(...weights) - Math.min(...weights), 2);
    if (variance < 0.2) {
      patterns.push({
        code: "weight_plateau",
        severity: "warning",
        message: `Weight stayed within a ${variance} range over the last 14 days, which looks like a plateau.`,
        action: "Consider a small calorie adjustment or an activity bump if this plateau is not intentional.",
      });
    }
  }

  const projection = buildWeightGoalProjection(weightSeries, goals);
  if (projection) {
    patterns.push({
      code: "weight_goal_projection",
      severity: "positive",
      message: `At your current ${projection.direction} rate of ${projection.weeklyRate} per week, you would reach goal around ${projection.projectedDate}.`,
      action: "Keep the current logging consistency so the projection stays reliable.",
    });
  }

  const milestone = [365, 180, 90, 60, 30, 14, 7].find((value) => value === streakCurrent);
  if (milestone) {
    patterns.push({
      code: "streak_milestone",
      severity: "positive",
      message: `You hit a ${milestone}-day logging streak milestone.`,
      action: "Protect the streak with one simple log tomorrow, even if the day is imperfect.",
      badgeCode: `streak_${milestone}`,
    });
  }

  return patterns;
}

function buildCheckinPatternObservations(patterns: CoachingPattern[]) {
  return patterns
    .filter((pattern) =>
      pattern.code === "protein_deficit" ||
      pattern.code === "calorie_overconsumption" ||
      pattern.code === "skipped_meals" ||
      pattern.code === "late_night_eating" ||
      pattern.code === "macro_imbalance",
    )
    .map((pattern) => pattern.message);
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

// --- State builders ---

async function buildDailyState(
  supabase: DbClient,
  userId: string,
  date: string,
  timeZone?: string | null,
): Promise<DailyState> {
  const [goals, preferences, agentNotes, recentMealCount, weightEntryCount] = await Promise.all([
    ensureGoals(supabase, userId),
    ensurePreferences(supabase, userId),
    fetchAgentNotes(supabase, userId, "note_key", true),
    fetchRecentMealCount(supabase, userId, timeZone),
    fetchWeightEntryCount(supabase, userId),
  ]);

  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, legacy_meal_id, meal_name, calories, protein, carbs, fats, estimation_notes, consumed_at")
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
      estimationNotes: meal.estimation_notes ? String(meal.estimation_notes) : null,
    })),
    agentNotes,
    onboarding: buildOnboardingGuide({
      recentMealCount,
      weightEntryCount,
      agentNoteCount: agentNotes.length,
    }),
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

function rangeStart(range: string, timeZone?: string | null): string {
  const normalized = range.toUpperCase();
  const days = RANGE_DAYS[normalized] ?? RANGE_DAYS["90D"];
  return addDaysToIsoDate(todayIsoDate(timeZone), -days);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function round(value: number, decimals = 1) {
  const pow = 10 ** decimals;
  return Math.round(value * pow) / pow;
}

function noteText(note: AgentNote) {
  return `${note.key} ${note.value}`.toLowerCase();
}

function weightChangeSummary(weightSeries: WeightPoint[], timeZone?: string | null) {
  const spans = [3, 7, 14, 30, 90];
  const latest = weightSeries.at(-1)?.weight;
  const today = todayIsoDate(timeZone);

  const entries = spans.map((span) => {
    if (latest == null) {
      return {
        label: `${span} day`,
        delta: 0,
        trend: "No change",
      };
    }

    const targetIso = addDaysToIsoDate(today, -span);

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
  timeZone?: string | null,
) {
  const normalizedRange = range.toUpperCase();
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const startDate = rangeStart(normalizedRange, resolvedTimeZone);
  const today = todayIsoDate(resolvedTimeZone);

  const [
    { data: weights, error: weightsError },
    { data: totals, error: totalsError },
    goals,
    preferences,
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
    ensureGoals(supabase, userId),
    ensurePreferences(supabase, userId),
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
    const iso = addDaysToIsoDate(today, -(6 - i));
    const dayData = calorieSeries.find((entry) => entry.date === iso);
    return {
      day: weekdayLabel(iso, resolvedTimeZone),
      consumed: Number(dayData?.calories ?? 0),
    };
  });

  const weeklyConsumed = weeklyPoints.reduce((acc, point) => acc + point.consumed, 0);

  const lastWeight = weightSeries.at(-1)?.weight ?? Number(goals.start_weight ?? 0);
  const heightMeters = Number(preferences.height_cm ?? 170) / 100;
  const bmi = heightMeters > 0 ? round(lastWeight / (heightMeters * heightMeters), 1) : 0;

  const streakSet = new Set(
    calorieSeries.filter((entry) => entry.meals > 0).map((entry) => entry.date),
  );

  let streakCurrent = 0;
  let cursorIso = today;
  while (streakSet.has(cursorIso)) {
    streakCurrent += 1;
    cursorIso = addDaysToIsoDate(cursorIso, -1);
  }

  const derivedBadges = [
    streakCurrent >= 7 ? "week_streak" : null,
    streakCurrent >= 30 ? "month_streak" : null,
    weightSeries.length >= 10 ? "consistent_logger" : null,
    streakCurrent >= 7 ? "streak_7" : null,
    streakCurrent >= 14 ? "streak_14" : null,
    streakCurrent >= 30 ? "streak_30" : null,
    streakCurrent >= 60 ? "streak_60" : null,
    streakCurrent >= 90 ? "streak_90" : null,
    streakCurrent >= 180 ? "streak_180" : null,
    streakCurrent >= 365 ? "streak_365" : null,
  ].filter(Boolean) as string[];

  const badgeList = Array.from(
    new Set([...(badges ?? []).map((badge) => String(badge.badge_code)), ...derivedBadges]),
  );

  const weightChanges = weightChangeSummary(weightSeries, resolvedTimeZone);

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
      consumed: weeklyConsumed,
      daily: weeklyPoints,
    },
    bmi: {
      value: bmi,
      status: bmi >= 30 ? "Obese" : bmi >= 25 ? "Overweight" : bmi >= 18.5 ? "Healthy" : "Underweight",
    },
    streak: {
      current: streakCurrent,
      week: Array.from({ length: 7 }).map((_, i) => {
        const iso = addDaysToIsoDate(today, -(6 - i));
        return {
          day: weekdayLabel(iso, resolvedTimeZone).slice(0, 1),
          hit: streakSet.has(iso),
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

async function fetchStateAndProgress(
  userId: string,
  date: string,
  range: string,
  timeZone?: string | null,
) {
  const supabase = dbClient();
  const [state, progress] = await Promise.all([
    buildDailyState(supabase, userId, date, timeZone),
    buildProgress(supabase, userId, range, timeZone),
  ]);

  return { state, progress };
}

// --- Tool handlers ---

export async function logMeal(
  params: {
    name: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    estimation_notes?: string;
    date?: string;
  },
  context?: RequestContext,
) {
  const name = sanitizeText(params.name, 200);
  const calories = clampPositive(params.calories, 0, 50000);
  const protein = clampPositive(params.protein, 0, 5000);
  const carbs = clampPositive(params.carbs, 0, 5000);
  const fats = clampPositive(params.fats, 0, 5000);
  const estimationNotes = params.estimation_notes
    ? sanitizeText(params.estimation_notes, 500).trim()
    : null;

  if (!name) {
    return { success: false, error: "name and calories are required", failureClass: "validation_error" };
  }

  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "logging meals", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const loggedDate = normalizeDate(params.date, context?.timeZone);
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "log_meal", context);
  if (rateLimitResult) return rateLimitResult;

  await ensureGoals(supabase, userId);
  await ensurePreferences(supabase, userId);

  const { error: insertError } = await supabase.from("meals").insert({
    user_id: userId,
    meal_name: name,
    calories,
    protein,
    carbs,
    fats,
    estimation_notes: estimationNotes,
    logged_date: loggedDate,
    consumed_at: new Date().toISOString(),
  });

  if (insertError) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName: "log_meal",
      failureClass: "db_error",
      detail: { reason: insertError.message, loggedDate },
      context,
    });
    return { success: false, error: insertError.message, failureClass: "db_error" };
  }

  await recalcDailyTotals(supabase, userId, loggedDate);

  const state = await buildDailyState(supabase, userId, loggedDate, context?.timeZone);
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "meal_logged",
    toolName: "log_meal",
    detail: {
      loggedDate,
      calories,
      protein,
      carbs,
      fats,
      hasEstimate: Boolean(estimationNotes),
    },
    context,
  });

  return {
    success: true,
    state,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: `Logged ${name}. ${summarizeDailyCalories(state)}`,
  };
}

export async function syncState(
  params: { date?: string; range?: string; page?: string } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "loading your dashboard", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const date = normalizeDate(params.date, context?.timeZone);
  const range = String(params.range ?? "90D").toUpperCase();
  const userId = identity.userId;

  const { state, progress } = await fetchStateAndProgress(userId, date, range, context?.timeZone);
  const page = String(params.page ?? "home");
  if (page === "home") {
    const supabase = dbClient();
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "dashboard_open",
      toolName: "sync_state",
      page,
      detail: {
        date,
        range,
        isNewUser: state.onboarding.isNewUser,
        mealsLoggedToday: state.meals.length,
        weightEntriesInRange: progress.weightSeries.length,
      },
      context,
    });
  }

  return {
    success: true,
    state,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
    page,
  };
}

export async function deleteMeal(params: { meal_id: string; date?: string }, context?: RequestContext) {
  if (!params.meal_id) {
    return { success: false, error: "meal_id is required", failureClass: "validation_error" };
  }

  const mealId = String(params.meal_id);
  if (!UUID_RE.test(mealId) && !LEGACY_ID_RE.test(mealId)) {
    return { success: false, error: "Invalid meal_id format", failureClass: "validation_error" };
  }

  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "deleting meals", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const date = normalizeDate(params.date, context?.timeZone);
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "delete_meal", context);
  if (rateLimitResult) return rateLimitResult;
  const { data: mealBeforeDelete } = await supabase
    .from("meals")
    .select("meal_name, calories")
    .eq("user_id", userId)
    .or(`id.eq.${mealId},legacy_meal_id.eq.${mealId}`)
    .maybeSingle();

  const { error } = await supabase
    .from("meals")
    .delete()
    .eq("user_id", userId)
    .or(`id.eq.${mealId},legacy_meal_id.eq.${mealId}`);

  if (error) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName: "delete_meal",
      failureClass: "db_error",
      detail: { reason: error.message, mealId, date },
      context,
    });
    return { success: false, error: error.message, failureClass: "db_error" };
  }

  await recalcDailyTotals(supabase, userId, date);
  const state = await buildDailyState(supabase, userId, date, context?.timeZone);
  const deletedMealName = mealBeforeDelete?.meal_name ? String(mealBeforeDelete.meal_name) : null;

  return {
    success: true,
    state,
    deletedMealName,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: deletedMealName
      ? `Deleted ${deletedMealName}. ${summarizeDailyCalories(state)}`
      : `Meal deleted. ${summarizeDailyCalories(state)}`,
  };
}

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
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "updating goals", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const date = normalizeDate(params.date, context?.timeZone);
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "update_goals", context);
  if (rateLimitResult) return rateLimitResult;

  const existing = await ensureGoals(supabase, userId);

  const patch = {
    user_id: userId,
    calories: params.calories != null ? clampPositive(params.calories, Number(existing.calories), 50000) : Number(existing.calories),
    protein: params.protein != null ? clampPositive(params.protein, Number(existing.protein), 5000) : Number(existing.protein),
    carbs: params.carbs != null ? clampPositive(params.carbs, Number(existing.carbs), 5000) : Number(existing.carbs),
    fats: params.fats != null ? clampPositive(params.fats, Number(existing.fats), 5000) : Number(existing.fats),
    goal_weight:
      params.goal_weight != null
        ? clampPositive(params.goal_weight, existing.goal_weight != null ? Number(existing.goal_weight) : 65, 1000)
        : existing.goal_weight != null
          ? Number(existing.goal_weight)
          : null,
    start_weight:
      params.start_weight != null
        ? clampPositive(params.start_weight, existing.start_weight != null ? Number(existing.start_weight) : 76, 1000)
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
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName: "update_goals",
      failureClass: "db_error",
      detail: { reason: error.message },
      context,
    });
    return { success: false, error: error.message, failureClass: "db_error" };
  }

  await recalcDailyTotals(supabase, userId, date);
  const state = await buildDailyState(supabase, userId, date, context?.timeZone);
  const changedGoals = summarizeGoalChanges(params, state.goals);
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "goals_updated",
    toolName: "update_goals",
    detail: { changedGoals },
    context,
  });

  return {
    success: true,
    state,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: changedGoals.length > 0 ? `Saved goals: ${changedGoals.join(", ")}.` : "Goals saved.",
  };
}

export async function logWeight(
  params: { weight: number; date?: string; range?: string },
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "logging weight", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;

  const weight = clampPositive(params.weight, 0, 1000);
  if (weight <= 0) {
    return { success: false, error: "weight must be a positive number", failureClass: "validation_error" };
  }

  const entryDate = normalizeDate(params.date, context?.timeZone);
  const range = String(params.range ?? "90D").toUpperCase();
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "log_weight", context);
  if (rateLimitResult) return rateLimitResult;

  const { error } = await supabase.from("weight_entries").upsert(
    {
      user_id: userId,
      entry_date: entryDate,
      weight,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_date" },
  );

  if (error) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName: "log_weight",
      failureClass: "db_error",
      detail: { reason: error.message, entryDate, range },
      context,
    });
    return { success: false, error: error.message, failureClass: "db_error" };
  }

  await supabase.from("badge_events").upsert(
    {
      user_id: userId,
      badge_code: "weight_logged",
    },
    { onConflict: "user_id,badge_code" },
  );

  const progress = await buildProgress(supabase, userId, range, context?.timeZone);
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "weight_logged",
    toolName: "log_weight",
    detail: { entryDate, weight, range },
    context,
  });
  const streakSummary =
    progress.streak?.current != null
      ? ` Current streak is ${Math.round(progress.streak.current)} day${progress.streak.current === 1 ? "" : "s"}.`
      : "";
  const bmiSummary = progress.bmi?.value != null ? ` BMI is ${progress.bmi.value.toFixed(1)}.` : "";

  return {
    success: true,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: `Saved ${weight.toFixed(1)} kg for ${entryDate}.${streakSummary}${bmiSummary}`.replace(/\s+/g, " ").trim(),
  };
}

export async function getProgress(
  params: { range?: string } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "loading progress", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const range = String(params.range ?? "90D").toUpperCase();
  const userId = identity.userId;
  const supabase = dbClient();

  const progress = await buildProgress(supabase, userId, range, context?.timeZone);

  return {
    success: true,
    progress,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

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
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "updating preferences", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;

  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "update_preferences", context);
  if (rateLimitResult) return rateLimitResult;
  const existing = await ensurePreferences(supabase, userId);

  const patch = {
    user_id: userId,
    unit_weight: params.unit_weight ?? existing.unit_weight,
    unit_energy: params.unit_energy ?? existing.unit_energy,
    language: params.language ? sanitizeText(params.language, 10) : String(existing.language),
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
    height_cm: params.height_cm != null ? clampPositive(params.height_cm, Number(existing.height_cm), 300) : Number(existing.height_cm),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    await recordAnalyticsEvent(supabase, {
      userId,
      eventName: "tool_error",
      toolName: "update_preferences",
      failureClass: "db_error",
      detail: { reason: error.message },
      context,
    });
    return { success: false, error: error.message, failureClass: "db_error" };
  }
  const changedPreferences = summarizePreferenceChanges(params, data as Record<string, unknown>);
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "preferences_updated",
    toolName: "update_preferences",
    detail: { changedPreferences },
    context,
  });

  return {
    success: true,
    preferences: data,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: changedPreferences.length > 0
      ? `Saved preferences: ${changedPreferences.join(", ")}.`
      : "Preferences saved.",
  };
}

export async function saveAgentNote(
  params: { note_key?: string; note_value?: string },
  context?: RequestContext,
) {
  const rawNoteKey = String(params.note_key ?? "").trim();
  const noteKey = sanitizeNoteKey(params.note_key, 100);
  const noteValue = sanitizeText(params.note_value, 2000).trim();

  if (!rawNoteKey) {
    return { success: false, error: "note_key is required" };
  }
  if (!noteKey || !NOTE_KEY_RE.test(noteKey)) {
    return { success: false, error: "Invalid note_key format" };
  }
  if (!noteValue) {
    return { success: false, error: "note_value is required" };
  }

  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "saving agent notes", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "save_agent_note", context);
  if (rateLimitResult) return rateLimitResult;

  const { data, error } = await supabase
    .from("agent_notes")
    .upsert(
      {
        user_id: userId,
        note_key: noteKey,
        note_value: noteValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,note_key" },
    )
    .select("note_key, note_value, updated_at")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    note: mapAgentNote(data as Record<string, unknown>),
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Agent note saved",
  };
}

export async function getAgentNotes(
  _params: Record<string, never> = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "loading agent notes", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();

  const notes = await fetchAgentNotes(supabase, userId, "updated_at", false);

  return {
    success: true,
    notes,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function getUserProfile(
  params: { range?: string } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "loading your profile", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const range = String(params.range ?? "90D").toUpperCase();
  const supabase = dbClient();

  const [goals, preferences] = await Promise.all([
    ensureGoals(supabase, userId),
    ensurePreferences(supabase, userId),
  ]);

  const [progress, agentNotes, recentMealCount] = await Promise.all([
    buildProgress(supabase, userId, range, context?.timeZone),
    fetchAgentNotes(supabase, userId, "updated_at", false),
    fetchRecentMealCount(supabase, userId, context?.timeZone),
  ]);
  const onboarding = buildOnboardingGuide({
    recentMealCount,
    weightEntryCount: progress.weightSeries.length,
    agentNoteCount: agentNotes.length,
  });

  return {
    success: true,
    profile: {
      isNewUser: onboarding.isNewUser,
      onboarding,
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
        heightCm: Number(preferences.height_cm ?? DEFAULT_PREFERENCES.height_cm),
      },
      trends: {
        range: progress.range,
        currentWeight: progress.currentWeight,
        bmi: progress.bmi,
        streak: progress.streak.current,
        weightChanges: progress.weightChanges,
        dailyAverageCalories: progress.dailyAverageCalories,
      },
      recentMealCount,
      agentNotes,
    },
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function getRecentMeals(
  params: { limit?: number } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "loading recent meals", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();
  const limit = clampPositive(params.limit, 20, 50);

  const meals = await fetchRecentMeals(supabase, userId, limit);

  return {
    success: true,
    meals,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function getMealSuggestions(
  params: { date?: string; limit?: number } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "planning meal suggestions", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const date = normalizeDate(params.date, context?.timeZone);
  const supabase = dbClient();
  const limit = clampPositive(params.limit, 3, 8);

  const [state, agentNotes] = await Promise.all([
    buildDailyState(supabase, userId, date),
    fetchAgentNotes(supabase, userId, "updated_at", false),
  ]);

  if (
    state.goals.calories <= 0 ||
    state.goals.protein <= 0 ||
    state.goals.carbs <= 0 ||
    state.goals.fats <= 0
  ) {
    return {
      success: true,
      suggestions: [],
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const remainingCalories = Math.max(state.goals.calories - state.totalCalories, 0);
  const remainingProtein = Math.max(state.goals.protein - state.totalProtein, 0);
  const remainingCarbs = Math.max(state.goals.carbs - state.totalCarbs, 0);
  const remainingFats = Math.max(state.goals.fats - state.totalFats, 0);

  if (remainingCalories === 0 && remainingProtein === 0 && remainingCarbs === 0 && remainingFats === 0) {
    return {
      success: true,
      suggestions: [],
      mode: identity.authenticated ? "authenticated" : "demo",
    };
  }

  const vegetarian = isVegetarianPreference(agentNotes);
  const templates = [
    { name: "Protein shake", calories: 180, protein: 30, carbs: 8, fats: 3, vegetarian: true },
    { name: "Greek yogurt bowl", calories: 220, protein: 20, carbs: 18, fats: 4, vegetarian: true },
    { name: "Tofu stir-fry", calories: 360, protein: 28, carbs: 30, fats: 14, vegetarian: true },
    { name: "Grilled chicken salad", calories: 340, protein: 35, carbs: 16, fats: 12, vegetarian: false },
    { name: "Turkey wrap", calories: 320, protein: 28, carbs: 30, fats: 10, vegetarian: false },
  ].filter((template) => !vegetarian || template.vegetarian);

  const suggestions = templates
    .map((template) => {
      const proteinBias =
        remainingProtein > state.goals.protein * 0.25 ? template.protein * 2 : template.protein;
      const caloriePenalty =
        remainingCalories <= Math.max(400, state.goals.calories * 0.2) ? template.calories : template.calories / 2;
      const fitPenalty =
        Math.max(template.calories - (remainingCalories + 150), 0) +
        Math.max(template.carbs - (remainingCarbs + 40), 0) +
        Math.max(template.fats - (remainingFats + 20), 0);

      return {
        ...template,
        score: proteinBias - caloriePenalty - fitPenalty,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((template) => ({
      name: template.name,
      calories: template.calories,
      protein: template.protein,
      carbs: template.carbs,
      fats: template.fats,
      reason:
        remainingProtein > state.goals.protein * 0.25
          ? "High-protein option to help close today's protein gap."
          : remainingCalories <= Math.max(400, state.goals.calories * 0.2)
            ? "Lower-calorie option that fits near today's calorie target."
            : "Balanced option based on today's remaining calories and macros.",
    }));

  return {
    success: true,
    suggestions,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function deleteAgentNote(
  params: { note_key?: string },
  context?: RequestContext,
) {
  const rawNoteKey = String(params.note_key ?? "").trim();
  const noteKey = sanitizeNoteKey(params.note_key, 100);

  if (!rawNoteKey) {
    return { success: false, error: "note_key is required" };
  }
  if (!noteKey || !NOTE_KEY_RE.test(noteKey)) {
    return { success: false, error: "Invalid note_key format" };
  }

  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "deleting saved notes", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "delete_agent_note", context);
  if (rateLimitResult) return rateLimitResult;

  const { error } = await supabase
    .from("agent_notes")
    .delete()
    .eq("user_id", userId)
    .eq("note_key", noteKey);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    deletedKey: noteKey,
    mode: identity.authenticated ? "authenticated" : "demo",
    message: "Agent note deleted",
  };
}

export async function uploadProgressPhoto(
  params: { image_url: string; note?: string },
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "uploading a photo", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;

  if (!params.image_url) {
    return { success: false, error: "image_url is required" };
  }

  const userId = identity.userId;
  const supabase = dbClient();
  const rateLimitResult = await enforceWriteRateLimit(supabase, userId, "upload_progress_photo", context);
  if (rateLimitResult) return rateLimitResult;
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

export async function runDailyCheckin(
  params: { date?: string; range?: string } = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "running a daily check-in", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const date = normalizeDate(params.date, context?.timeZone);
  const range = String(params.range ?? "90D").toUpperCase();
  const userId = identity.userId;

  const { state, progress } = await fetchStateAndProgress(userId, date, range, context?.timeZone);
  const supabase = dbClient();
  const resolvedTimeZone = resolveTimeZone(context?.timeZone);
  const [recentDays, recentMeals] = await Promise.all([
    fetchRecentDailyTotals(supabase, userId, resolvedTimeZone, 7),
    fetchRecentMealPatterns(supabase, userId, resolvedTimeZone, 7),
  ]);
  const recommendations: string[] = [];
  const patterns = detectCoachingPatterns({
    goals: state.goals,
    recentDays,
    recentMeals,
    weightSeries: progress.weightSeries,
    streakCurrent: progress.streak.current,
    timeZone: resolvedTimeZone,
  });
  const observations = buildCheckinPatternObservations(patterns);

  if (state.totalCalories < state.goals.calories * 0.5) {
    recommendations.push("You are well below your calorie target today; consider adding a protein-focused meal.");
  }
  if (state.totalProtein < state.goals.protein * 0.7) {
    recommendations.push("Protein is low versus your goal; add a high-protein snack to improve recovery.");
  }
  if (state.totalCalories > state.goals.calories) {
    recommendations.push("You are above your calorie target. Keep the next meal lighter and protein-forward.");
  }
  if (observations.length > 0) {
    recommendations.push(...observations);
  }
  if (recommendations.length === 0) {
    recommendations.push("You are tracking well today. Stay consistent with hydration and meal timing.");
  }
  if (progress.streak.current > 0) {
    recommendations.push(`Current logging streak: ${progress.streak.current} day${progress.streak.current === 1 ? "" : "s"}.`);
  }
  const checkin = {
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
    observations,
    recommendations,
  };
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "daily_checkin_run",
    toolName: "run_daily_checkin",
    detail: {
      date,
      range,
      observationCount: observations.length,
      recommendationCount: recommendations.length,
      streak: progress.streak.current,
    },
    context,
  });

  return {
    success: true,
    checkin,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function runWeeklyReview(
  _params: Record<string, never> = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "running a weekly review", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();
  const resolvedTimeZone = resolveTimeZone(context?.timeZone);

  const [goals, progress, recentDays, recentMeals] = await Promise.all([
    ensureGoals(supabase, userId),
    buildProgress(supabase, userId, "90D", resolvedTimeZone),
    fetchRecentDailyTotals(supabase, userId, resolvedTimeZone, 7),
    fetchRecentMealPatterns(supabase, userId, resolvedTimeZone, 7),
  ]);

  const lastWeek = progress.weeklyEnergy.daily;
  const consumedAverage = round(average(lastWeek.map((point) => point.consumed)), 0);
  const calorieGoal = Number(goals.calories ?? DEFAULT_GOALS.calories);
  const weightDelta7 = progress.weightChanges.find((item) => item.label === "7 day")?.delta ?? 0;
  const weeklyGoals = {
    calories: Number(goals.calories ?? DEFAULT_GOALS.calories),
    protein: Number(goals.protein ?? DEFAULT_GOALS.protein),
    carbs: Number(goals.carbs ?? DEFAULT_GOALS.carbs),
    fats: Number(goals.fats ?? DEFAULT_GOALS.fats),
    goalWeight: goals.goal_weight != null ? Number(goals.goal_weight) : null,
    startWeight: goals.start_weight != null ? Number(goals.start_weight) : null,
    targetDate: goals.target_date ? String(goals.target_date) : null,
  };
  const patterns = detectCoachingPatterns({
    goals: weeklyGoals,
    recentDays,
    recentMeals,
    weightSeries: progress.weightSeries,
    streakCurrent: progress.streak.current,
    timeZone: resolvedTimeZone,
  });
  const goalProjection = buildWeightGoalProjection(progress.weightSeries, weeklyGoals);

  const insights: string[] = [];
  if (consumedAverage > calorieGoal) {
    insights.push("Average daily intake exceeded your calorie goal this week.");
  } else if (consumedAverage < calorieGoal * 0.8) {
    insights.push("Average daily intake was well below your calorie goal this week.");
  } else {
    insights.push("Average daily intake tracked close to your calorie goal this week.");
  }

  if (weightDelta7 > 0.3) {
    insights.push("Weight trend increased over 7 days. Review calorie-dense meals and sodium swings.");
  } else if (weightDelta7 < -0.3) {
    insights.push("Weight trend decreased over 7 days. Keep protein intake stable to retain muscle.");
  } else {
    insights.push("Weight remained relatively stable over the last 7 days.");
  }

  if (patterns.length > 0) {
    insights.push(`Detected ${patterns.length} coaching pattern${patterns.length === 1 ? "" : "s"} worth reviewing this week.`);
  } else {
    insights.push("No strong risk patterns stood out this week. Consistency is the main priority.");
  }

  const actionPlan = Array.from(new Set(patterns.map((pattern) => pattern.action)));
  if (actionPlan.length === 0) {
    actionPlan.push("Stay consistent with logging and rerun the review after a few more days of data.");
  }
  const review = {
    period: "last_7_days",
    consumedAverage,
    calorieGoal,
    weightDelta7,
    insights,
    patterns,
    actionPlan,
    goalProjection,
    suggestion: "Use suggest_goal_adjustments for a numeric goal recommendation.",
  };
  await recordAnalyticsEvent(supabase, {
    userId,
    eventName: "weekly_review_run",
    toolName: "run_weekly_review",
    detail: {
      period: review.period,
      patternCount: review.patterns.length,
      actionPlanCount: review.actionPlan.length,
      hasGoalProjection: Boolean(review.goalProjection),
    },
    context,
  });

  return {
    success: true,
    review,
    mode: identity.authenticated ? "authenticated" : "demo",
  };
}

export async function suggestGoalAdjustments(
  _params: Record<string, never> = {},
  context?: RequestContext,
) {
  const { identity, authErrorResult } = await resolveAuthorizedIdentity(context, "suggesting goal adjustments", REQUIRED_OAUTH_SCOPE);
  if (authErrorResult) return authErrorResult;
  const userId = identity.userId;
  const supabase = dbClient();

  const [goals, progress] = await Promise.all([
    ensureGoals(supabase, userId),
    buildProgress(supabase, userId, "90D", context?.timeZone),
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
