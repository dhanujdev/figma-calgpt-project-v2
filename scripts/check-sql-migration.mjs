import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const requiredTables = [
  'nutrition_goals',
  'user_preferences',
  'meals',
  'daily_totals',
  'weight_entries',
  'progress_photos',
  'streak_events',
  'badge_events',
];

function isSchemaMigration(sql) {
  return requiredTables.every((table) => sql.includes(`create table if not exists public.${table}`));
}

const candidates = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => {
    const fileUrl = new URL(entry.name, migrationsDir);
    return {
      name: entry.name,
      sql: readFileSync(fileUrl, 'utf8'),
    };
  })
  .filter((entry) => isSchemaMigration(entry.sql))
  .sort((left, right) => left.name.localeCompare(right.name));

if (candidates.length === 0) {
  throw new Error(`No active schema migration found in ${path.resolve(migrationsDir.pathname)}`);
}

const { name: migrationName, sql } = candidates.at(-1);

for (const table of requiredTables) {
  if (!sql.includes(`create table if not exists public.${table}`)) {
    throw new Error(`Missing table in migration: ${table}`);
  }
  if (!sql.includes(`alter table public.${table} enable row level security`)) {
    throw new Error(`Missing RLS enable for table: ${table}`);
  }
}

const allMigrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => readFileSync(new URL(entry.name, migrationsDir), 'utf8'));

const hasAgentNotesMigration = allMigrations.some((migrationSql) =>
  migrationSql.includes('create table if not exists public.agent_notes') &&
  migrationSql.includes('alter table public.agent_notes enable row level security')
);

if (!hasAgentNotesMigration) {
  throw new Error('Missing agent_notes migration with RLS');
}

const hasEstimationNotesMigration = allMigrations.some((migrationSql) =>
  migrationSql.includes('alter table public.meals') &&
  migrationSql.includes('add column if not exists estimation_notes text')
);

if (!hasEstimationNotesMigration) {
  throw new Error('Missing estimation_notes migration');
}

const hasAnalyticsEventsMigration = allMigrations.some((migrationSql) =>
  migrationSql.includes('create table if not exists public.analytics_events') &&
  migrationSql.includes('alter table public.analytics_events enable row level security')
);

if (!hasAnalyticsEventsMigration) {
  throw new Error('Missing analytics_events migration with RLS');
}

console.log(`check-sql-migration: OK (${migrationName})`);
