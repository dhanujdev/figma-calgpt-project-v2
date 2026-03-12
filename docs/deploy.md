# Deploy

## Locked Production Targets

- Public MCP URL: `https://figma-calgpt-project.vercel.app/mcp`
- Diagnostic MCP URL: `https://figma-calgpt-project.vercel.app/api/mcp`
- Widget URI: `ui://widget/gpt-calories-v4.html`
- Supabase function endpoint: `https://jpjxpyhuawgyrhbnnqyb.supabase.co/functions/v1/server/mcp`

## Required Configuration

### Vercel

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_MCP_ENDPOINT`

### Supabase function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOW_DEMO_MODE=false`

### Optional Vercel OAuth overrides

- `OAUTH_AUTHORIZATION_SERVER`
- `OAUTH_AUTHORIZATION_ENDPOINT`
- `OAUTH_TOKEN_ENDPOINT`
- `OAUTH_REGISTRATION_ENDPOINT`

## Deployment Order

1. Align migration history if local and remote drift.
2. Apply SQL changes:

```bash
supabase db push --project-ref jpjxpyhuawgyrhbnnqyb
```

3. Deploy Supabase function:

```bash
supabase functions deploy server --project-ref jpjxpyhuawgyrhbnnqyb
```

4. Deploy Vercel from latest `main`.

## Endpoint Verification

### Direct Supabase probe

```bash
curl -i 'https://jpjxpyhuawgyrhbnnqyb.supabase.co/functions/v1/server/mcp' \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H 'content-type: application/json' \
  --data '{"method":"sync_state","params":{}}'
```

Expected: `200`.

### MCP probe through Vercel

```bash
curl -sS https://figma-calgpt-project.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

curl -sS https://figma-calgpt-project.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sync_state","arguments":{}}}'

curl -sS https://figma-calgpt-project.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_progress","arguments":{"range":"90D"}}}'
```

## Release Gate

Run before shipping:

```bash
npm ci
npm run test:strict
MCP_BASE_URL=https://figma-calgpt-project.vercel.app/mcp npm run smoke:mcp
```

## Migration Drift Rule

If `db push` or `db pull` fails because local and remote histories differ:

1. preserve local-only migrations outside `supabase/migrations`
2. run `supabase migration fetch --project-ref jpjxpyhuawgyrhbnnqyb`
3. diff fetched SQL against local work
4. add a reconcile migration if needed
5. avoid `migration repair --status reverted` unless schema rollback is intentional
