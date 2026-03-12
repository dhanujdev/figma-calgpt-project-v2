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

console.log(`check-sql-migration: OK (${migrationName})`);
