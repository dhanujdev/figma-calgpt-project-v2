import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../api/mcp.ts', import.meta.url), 'utf8');
const requiredTools = [
  'log_meal',
  'sync_state',
  'delete_meal',
  'update_goals',
  'log_weight',
  'get_progress',
  'update_preferences',
  'upload_progress_photo',
  'run_daily_checkin',
  'run_weekly_review',
  'suggest_goal_adjustments',
];

for (const tool of requiredTools) {
  if (!text.includes(`name: "${tool}"`)) {
    throw new Error(`Missing MCP tool definition: ${tool}`);
  }
}

if (!text.includes('ui://widget/gpt-calories-v4.html')) {
  throw new Error('Widget URI v4 is missing in MCP contract');
}

if (!text.includes('mcp/www_authenticate')) {
  throw new Error('Auth challenge metadata is missing');
}

console.log('check-mcp-contract: OK');
