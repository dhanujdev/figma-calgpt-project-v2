import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAgentNote,
  getAgentNotes,
  saveAgentNote,
  syncState,
} from "../../supabase/functions/server/mcp_handler.tsx";
import { installMockSupabase } from "../helpers/mock-supabase";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "99999999-9999-9999-9999-999999999999";

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
          height_cm: 175,
        },
      ],
      daily_totals: [
        {
          user_id: DEMO_USER_ID,
          entry_date: "2026-03-12",
          total_calories: 600,
          total_protein: 50,
          total_carbs: 60,
          total_fats: 20,
          meal_count: 2,
        },
      ],
      weight_entries: [
        { user_id: DEMO_USER_ID, entry_date: "2026-03-12", weight: 79 },
      ],
      agent_notes: [
        {
          user_id: DEMO_USER_ID,
          note_key: "preference:high-protein",
          note_value: "Prefers protein-forward meals.",
          updated_at: "2026-03-11T12:00:00.000Z",
        },
        {
          user_id: OTHER_USER_ID,
          note_key: "allergy:peanuts",
          note_value: "Should never leak.",
          updated_at: "2026-03-12T09:00:00.000Z",
        },
      ],
      meals: [],
      streak_events: [],
      badge_events: [],
      progress_photos: [],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T16:00:00.000Z"));
});

describe("saveAgentNote", () => {
  it("creates a new note", async () => {
    const client = setupMock();
    const result = await saveAgentNote({
      note_key: "allergy:shellfish",
      note_value: "Avoid shellfish in all meal suggestions.",
    });

    expect(result.success).toBe(true);
    expect(result.note).toMatchObject({
      key: "allergy:shellfish",
      value: "Avoid shellfish in all meal suggestions.",
    });
    expect(client.__tables.agent_notes.some((row) => row.note_key === "allergy:shellfish")).toBe(true);
  });

  it("updates an existing note by key", async () => {
    setupMock();
    await saveAgentNote({
      note_key: "preference:high-protein",
      note_value: "Wants at least 30g protein per meal.",
    });

    const notes = await getAgentNotes();
    expect(notes.notes.find((note) => note.key === "preference:high-protein")?.value).toBe(
      "Wants at least 30g protein per meal.",
    );
  });

  it("sanitizes note_key and note_value", async () => {
    const result = await saveAgentNote({
      note_key: "Allergy:Peanuts!!!",
      note_value: `<b>Avoid peanuts & peanut oil</b>`,
    });

    expect(result.success).toBe(true);
    expect(result.note).toMatchObject({
      key: "allergy:peanuts",
      value: "bAvoid peanuts  peanut oil/b",
    });
  });

  it("rejects empty keys", async () => {
    setupMock();
    await expect(saveAgentNote({ note_key: "", note_value: "value" })).resolves.toEqual({
      success: false,
      error: "note_key is required",
    });
  });

  it("rejects empty values", async () => {
    setupMock();
    await expect(saveAgentNote({ note_key: "diet:vegan", note_value: "" })).resolves.toEqual({
      success: false,
      error: "note_value is required",
    });
  });
});

describe("getAgentNotes", () => {
  it("returns all notes for the user", async () => {
    setupMock();
    const result = await getAgentNotes();

    expect(result.success).toBe(true);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].key).toBe("preference:high-protein");
  });

  it("returns an empty array for a new user", async () => {
    installMockSupabase({ seed: { agent_notes: [] } });
    const result = await getAgentNotes();

    expect(result.success).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it("does not leak other users' notes", async () => {
    setupMock();
    const result = await getAgentNotes();

    expect(result.notes.some((note) => note.key === "allergy:peanuts")).toBe(false);
  });

  it("orders notes by updated_at descending", async () => {
    setupMock();
    await saveAgentNote({
      note_key: "diet:vegetarian",
      note_value: "Vegetarian meals only.",
    });

    const result = await getAgentNotes();
    expect(result.notes[0].key).toBe("diet:vegetarian");
  });
});

describe("deleteAgentNote", () => {
  it("deletes by key", async () => {
    setupMock();
    const result = await deleteAgentNote({ note_key: "preference:high-protein" });

    expect(result.success).toBe(true);
    expect((await getAgentNotes()).notes).toEqual([]);
  });

  it("returns success even if the key is missing", async () => {
    setupMock();
    const result = await deleteAgentNote({ note_key: "diet:vegan" });

    expect(result).toMatchObject({
      success: true,
      deletedKey: "diet:vegan",
    });
  });

  it("validates key format", async () => {
    setupMock();
    const result = await deleteAgentNote({ note_key: "!!!" });

    expect(result).toEqual({
      success: false,
      error: "Invalid note_key format",
    });
  });
});

describe("syncState with notes", () => {
  it("includes agentNotes in state", async () => {
    setupMock();
    const result = await syncState({ date: "2026-03-12", range: "90D" });

    expect(result.success).toBe(true);
    expect(result.state.agentNotes).toEqual([
      {
        key: "preference:high-protein",
        value: "Prefers protein-forward meals.",
        updatedAt: "2026-03-11T12:00:00.000Z",
      },
    ]);
  });

  it("sorts sync_state notes by key", async () => {
    setupMock();
    await saveAgentNote({
      note_key: "allergy:shellfish",
      note_value: "Avoid shellfish.",
    });

    const result = await syncState({ date: "2026-03-12", range: "90D" });
    expect(result.state.agentNotes.map((note) => note.key)).toEqual([
      "allergy:shellfish",
      "preference:high-protein",
    ]);
  });
});

describe("memory integration", () => {
  it("persists save, update, and delete across tool calls", async () => {
    setupMock();

    await saveAgentNote({ note_key: "diet:vegetarian", note_value: "Vegetarian." });
    expect((await getAgentNotes()).notes.some((note) => note.key === "diet:vegetarian")).toBe(true);

    await saveAgentNote({ note_key: "diet:vegetarian", note_value: "Vegan." });
    expect((await getAgentNotes()).notes.find((note) => note.key === "diet:vegetarian")?.value).toBe("Vegan.");

    await deleteAgentNote({ note_key: "diet:vegetarian" });
    expect((await getAgentNotes()).notes.some((note) => note.key === "diet:vegetarian")).toBe(false);
  });
});
