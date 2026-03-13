import { describe, expect, it, vi } from "vitest";
import { buildLogRecord, logEvent } from "../../supabase/functions/server/logging.ts";

describe("structured logging", () => {
  it("builds parseable JSON records with stable metadata", () => {
    const record = buildLogRecord(
      "info",
      "request.completed",
      {
        requestId: "req-123",
        method: "POST",
        path: "/server/mcp",
        status: 200,
        durationMs: 18,
        widgetVersion: "v13",
      },
      new Date("2026-03-13T15:00:00.000Z"),
    );

    expect(record).toEqual({
      timestamp: "2026-03-13T15:00:00.000Z",
      level: "info",
      event: "request.completed",
      service: "calgpt-server",
      requestId: "req-123",
      method: "POST",
      path: "/server/mcp",
      status: 200,
      durationMs: 18,
      widgetVersion: "v13",
    });
  });

  it("serializes errors into valid JSON log lines", () => {
    const writer = vi.fn<(line: string) => void>();

    logEvent(
      "error",
      "analytics.record_failed",
      {
        eventName: "dashboard_open",
        toolName: "sync_state",
        error: new Error("Insert denied"),
      },
      writer,
    );

    expect(writer).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writer.mock.calls[0][0]);
    expect(payload).toMatchObject({
      level: "error",
      event: "analytics.record_failed",
      service: "calgpt-server",
      eventName: "dashboard_open",
      toolName: "sync_state",
      error: {
        name: "Error",
        message: "Insert denied",
      },
    });
  });
});
