export type LogLevel = "info" | "warn" | "error";

type LogDetails = Record<string, unknown> & {
  error?: unknown;
};

type JsonWriter = (line: string) => void;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : "Error",
      message: typeof record.message === "string" ? record.message : JSON.stringify(record),
    };
  }

  return { message: String(error) };
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function buildLogRecord(
  level: LogLevel,
  event: string,
  details: LogDetails = {},
  now = new Date(),
) {
  const { error, ...rest } = details;

  return stripUndefined({
    timestamp: now.toISOString(),
    level,
    event,
    service: "calgpt-server",
    ...rest,
    error: error == null ? undefined : serializeError(error),
  });
}

export function logEvent(
  level: LogLevel,
  event: string,
  details: LogDetails = {},
  writer?: JsonWriter,
) {
  const line = JSON.stringify(buildLogRecord(level, event, details));
  const sink =
    writer ??
    (level === "error"
      ? (message: string) => console.error(message)
      : (message: string) => console.log(message));
  sink(line);
}

export const __testables = {
  serializeError,
  stripUndefined,
};
