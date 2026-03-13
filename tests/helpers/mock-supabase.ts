type TableRow = Record<string, unknown>;
type TableName =
  | "nutrition_goals"
  | "user_preferences"
  | "meals"
  | "daily_totals"
  | "agent_notes"
  | "analytics_events"
  | "streak_events"
  | "badge_events"
  | "weight_entries"
  | "progress_photos";

type SeedData = Partial<Record<TableName, TableRow[]>>;
type QueryResult = { data: unknown; error: { message: string } | null };
type Filter = { kind: "eq" | "gte" | "lte"; field: string; value: unknown };
type AuthConfig = {
  usersByToken?: Record<string, string>;
};

const TABLES: TableName[] = [
  "nutrition_goals",
  "user_preferences",
  "meals",
  "daily_totals",
  "agent_notes",
  "analytics_events",
  "streak_events",
  "badge_events",
  "weight_entries",
  "progress_photos",
];

const DEFAULT_CONFLICT_KEYS: Partial<Record<TableName, string[]>> = {
  nutrition_goals: ["user_id"],
  user_preferences: ["user_id"],
  daily_totals: ["user_id", "entry_date"],
  agent_notes: ["user_id", "note_key"],
  streak_events: ["user_id", "entry_date"],
  badge_events: ["user_id", "badge_code"],
  weight_entries: ["user_id", "entry_date"],
};

export type MockSupabaseClient = {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } } | null; error: { message: string } | null }>;
  };
  from: (table: string) => MockQueryBuilder;
  __tables: Record<TableName, TableRow[]>;
  __calls: Array<{ table: string; action: string }>;
};

let currentClient: MockSupabaseClient | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  return String(left) < String(right) ? -1 : 1;
}

function parseConflictKeys(table: TableName, onConflict?: string) {
  if (onConflict) {
    return onConflict.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return DEFAULT_CONFLICT_KEYS[table] ?? [];
}

function parseOrFilters(expression: string) {
  return expression
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, operator, ...rest] = part.split(".");
      return {
        field,
        operator,
        value: rest.join("."),
      };
    });
}

class MockQueryBuilder implements PromiseLike<QueryResult> {
  private action: "select" | "insert" | "upsert" | "delete" = "select";
  private filters: Filter[] = [];
  private orFilters: Array<{ field: string; operator: string; value: string }> = [];
  private limitCount: number | null = null;
  private orderBy: { field: string; ascending: boolean } | null = null;
  private payload: TableRow[] = [];
  private onConflict?: string;
  private returnMode: "many" | "maybeSingle" | "single" = "many";
  private returnRowsAfterMutation = false;

  constructor(
    private client: MockSupabaseClient,
    private table: TableName,
  ) {}

  select(_columns = "*") {
    if (this.action === "insert" || this.action === "upsert" || this.action === "delete") {
      this.returnRowsAfterMutation = true;
      return this;
    }
    this.action = "select";
    return this;
  }

  insert(values: TableRow | TableRow[]) {
    this.action = "insert";
    this.payload = Array.isArray(values) ? clone(values) : [clone(values)];
    return this;
  }

  upsert(values: TableRow | TableRow[], options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = Array.isArray(values) ? clone(values) : [clone(values)];
    this.onConflict = options?.onConflict;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: "eq", field, value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ kind: "gte", field, value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ kind: "lte", field, value });
    return this;
  }

  limit(value: number) {
    this.limitCount = value;
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = { field, ascending: options?.ascending !== false };
    return this;
  }

  or(expression: string) {
    this.orFilters = parseOrFilters(expression);
    return this;
  }

  maybeSingle() {
    this.returnMode = "maybeSingle";
    return this.execute();
  }

  single() {
    this.returnMode = "single";
    return this.execute();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute() {
    this.client.__calls.push({ table: this.table, action: this.action });

    switch (this.action) {
      case "insert":
        return Promise.resolve(this.executeInsert());
      case "upsert":
        return Promise.resolve(this.executeUpsert());
      case "delete":
        return Promise.resolve(this.executeDelete());
      default:
        return Promise.resolve(this.executeSelect());
    }
  }

  private executeSelect(): QueryResult {
    const rows = this.selectedRows();
    return this.wrapRows(rows);
  }

  private executeInsert(): QueryResult {
    const tableRows = this.client.__tables[this.table];
    const inserted = this.payload.map((row) => this.prepareInsertRow(row));
    tableRows.push(...inserted);
    return this.returnRowsAfterMutation ? this.wrapRows(inserted) : { data: null, error: null };
  }

  private executeUpsert(): QueryResult {
    const conflictKeys = parseConflictKeys(this.table, this.onConflict);
    const tableRows = this.client.__tables[this.table];
    const upserted: TableRow[] = [];

    for (const row of this.payload) {
      const nextRow = this.prepareInsertRow(row);
      const index = tableRows.findIndex((existing) =>
        conflictKeys.length > 0 &&
        conflictKeys.every((key) => existing[key] === nextRow[key]),
      );

      if (index >= 0) {
        tableRows[index] = { ...tableRows[index], ...nextRow };
        upserted.push(clone(tableRows[index]));
      } else {
        tableRows.push(nextRow);
        upserted.push(clone(nextRow));
      }
    }

    return this.returnRowsAfterMutation ? this.wrapRows(upserted) : { data: null, error: null };
  }

  private executeDelete(): QueryResult {
    const tableRows = this.client.__tables[this.table];
    const keptRows: TableRow[] = [];
    const deletedRows: TableRow[] = [];

    for (const row of tableRows) {
      if (this.matchesRow(row)) {
        deletedRows.push(clone(row));
      } else {
        keptRows.push(row);
      }
    }

    this.client.__tables[this.table] = keptRows;
    return this.returnRowsAfterMutation ? this.wrapRows(deletedRows) : { data: null, error: null };
  }

  private selectedRows() {
    let rows = this.client.__tables[this.table].filter((row) => this.matchesRow(row)).map(clone);

    if (this.orderBy) {
      const { field, ascending } = this.orderBy;
      rows = rows.sort((left, right) => {
        const result = compareValues(left[field], right[field]);
        return ascending ? result : -result;
      });
    }

    if (typeof this.limitCount === "number") {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  private wrapRows(rows: TableRow[]): QueryResult {
    if (this.returnMode === "many") {
      return { data: rows, error: null };
    }

    const firstRow = rows[0] ?? null;
    if (!firstRow && this.returnMode === "single") {
      return { data: null, error: { message: "Row not found" } };
    }

    return { data: firstRow, error: null };
  }

  private matchesRow(row: TableRow) {
    const filterMatch = this.filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "gte") return compareValues(value, filter.value) >= 0;
      return compareValues(value, filter.value) <= 0;
    });

    if (!filterMatch) {
      return false;
    }

    if (this.orFilters.length === 0) {
      return true;
    }

    return this.orFilters.some((filter) => {
      if (filter.operator !== "eq") return false;
      return String(row[filter.field] ?? "") === filter.value;
    });
  }

  private prepareInsertRow(row: TableRow) {
    const nextRow = clone(row);

    if (this.table === "meals" && !nextRow.id) {
      nextRow.id = `mock-meal-${this.client.__calls.length + this.client.__tables.meals.length + 1}`;
    }

    if (this.table === "progress_photos" && !nextRow.id) {
      nextRow.id = `mock-photo-${this.client.__calls.length + this.client.__tables.progress_photos.length + 1}`;
    }

    if (this.table === "analytics_events" && !nextRow.id) {
      nextRow.id = `mock-analytics-${this.client.__calls.length + this.client.__tables.analytics_events.length + 1}`;
    }

    return nextRow;
  }
}

function createTableMap(seed?: SeedData) {
  const tables = {} as Record<TableName, TableRow[]>;

  for (const table of TABLES) {
    tables[table] = clone(seed?.[table] ?? []);
  }

  return tables;
}

function createAuthApi(auth?: AuthConfig) {
  return {
    async getUser(token: string) {
      const userId = auth?.usersByToken?.[token];
      if (!userId) {
        return {
          data: { user: null } as null,
          error: { message: "Invalid token" },
        };
      }

      return {
        data: { user: { id: userId } },
        error: null,
      };
    },
  };
}

export function installMockSupabase(options?: { seed?: SeedData; auth?: AuthConfig }) {
  currentClient = {
    auth: createAuthApi(options?.auth),
    from(table: string) {
      const tableName = table as TableName;
      if (!currentClient?.__tables[tableName]) {
        throw new Error(`Unknown mock table: ${table}`);
      }
      return new MockQueryBuilder(currentClient, tableName);
    },
    __tables: createTableMap(options?.seed),
    __calls: [],
  };

  return currentClient;
}

export function getMockSupabaseClient() {
  if (!currentClient) {
    return installMockSupabase();
  }
  return currentClient;
}
