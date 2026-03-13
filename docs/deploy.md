# Deploy

## Locked Production Targets

- Public MCP URL: `https://figma-calgpt-project-v2.vercel.app/mcp`
- Diagnostic MCP URL: `https://figma-calgpt-project-v2.vercel.app/api/mcp`
- Widget URI: `ui://widget/gpt-calories-v13.html`
- Supabase function endpoint: `https://jpjxpyhuawgyrhbnnqyb.supabase.co/functions/v1/server/mcp`

## Required Configuration

### Vercel

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_MCP_ENDPOINT`
- `MCP_AUTH_MODE=oauth`
- `MCP_DEFAULT_TIMEZONE=America/New_York`

### Supabase function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOW_DEMO_MODE=false`
- `MCP_DEFAULT_TIMEZONE=America/New_York`

### Supabase dashboard auth settings

- Enable Google under Auth -> Sign In / Providers
- Set Site URL to `https://figma-calgpt-project-v2.vercel.app`
- Add `https://figma-calgpt-project-v2.vercel.app/oauth/consent` to the redirect allowlist
- Enable Auth -> OAuth -> OAuth Server
- Set the authorization path to `/oauth/consent`

### Optional Vercel OAuth overrides

Only use these when Supabase OAuth Server discovery is unavailable or you are proxying to another identity provider.

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

If the release only adds analytics SQL views and does not touch `api/mcp.ts`, `public/component.html`, or `supabase/functions/server/`, Vercel and Supabase function deploys are not required.

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
curl -sS https://figma-calgpt-project-v2.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

curl -sS https://figma-calgpt-project-v2.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sync_state","arguments":{}}}'

curl -sS https://figma-calgpt-project-v2.vercel.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_progress","arguments":{"range":"90D"}}}'
```

Expected in OAuth mode without a linked user: `tools/call` should return `isError: true` plus `_meta["mcp/www_authenticate"]`.

### OAuth metadata probe

```bash
curl -sS https://figma-calgpt-project-v2.vercel.app/.well-known/oauth-protected-resource
curl -sS https://figma-calgpt-project-v2.vercel.app/.well-known/oauth-authorization-server
```

### Beta metrics verification

After analytics migrations, verify the reporting views in Supabase SQL editor:

```sql
select * from public.beta_funnel_summary;
select * from public.beta_prompt_dropoff;
select * from public.beta_empty_state_recovery;
select * from public.beta_retention_summary order by cohort_date desc limit 14;
```

## Release Gate

Run before shipping:

```bash
npm ci
npm run test:strict
MCP_AUTH_MODE=oauth MCP_BASE_URL=https://figma-calgpt-project-v2.vercel.app/mcp npm run smoke:mcp
```

## Migration Drift Rule

If `db push` or `db pull` fails because local and remote histories differ:

1. preserve local-only migrations outside `supabase/migrations`
2. run `supabase migration fetch --project-ref jpjxpyhuawgyrhbnnqyb`
3. diff fetched SQL against local work
4. add a reconcile migration if needed
5. avoid `migration repair --status reverted` unless schema rollback is intentional
