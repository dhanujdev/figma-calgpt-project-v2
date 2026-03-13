const base = process.env.MCP_BASE_URL;
const oauthMode = process.env.MCP_AUTH_MODE?.trim().toLowerCase() === 'oauth';

if (!base) {
  console.log('smoke-mcp: skipped (set MCP_BASE_URL to run live smoke tests)');
  process.exit(0);
}

const post = async (payload) => {
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`RPC failed: ${JSON.stringify(body)}`);
  }
  return body;
};

const assertNoUnknownMethod = (label, rpcResult) => {
  const errorText = JSON.stringify(rpcResult?.result?.structuredContent ?? rpcResult?.result ?? {});
  if (/Unknown method:/i.test(errorText)) {
    throw new Error(`${label} hit stale backend: ${errorText}`);
  }
};

const assertAuthAwareResult = (label, rpcResult) => {
  assertNoUnknownMethod(label, rpcResult);
  const result = rpcResult?.result ?? {};
  if (oauthMode) {
    const authMeta = result?._meta?.['mcp/www_authenticate'];
    if (!result?.isError || !Array.isArray(authMeta) || authMeta.length === 0) {
      throw new Error(`${label} did not return an OAuth challenge`);
    }
    return;
  }
  if (result?.isError) {
    throw new Error(`${label} unexpectedly returned an error: ${JSON.stringify(result)}`);
  }
};

await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
const tools = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
if (!Array.isArray(tools.result?.tools) || tools.result.tools.length < 6) {
  throw new Error('tools/list did not return expected tools');
}
const toolNames = new Set(tools.result.tools.map((tool) => tool?.name));
for (const required of ['log_weight', 'get_progress', 'update_preferences', 'run_daily_checkin']) {
  if (!toolNames.has(required)) {
    throw new Error(`tools/list missing ${required}`);
  }
}

const resources = await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
const uri = resources.result?.resources?.[0]?.uri;
if (!uri || !String(uri).includes('v13')) {
  throw new Error('resources/list missing v13 widget URI');
}

await post({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri } });
const syncState = await post({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { name: 'sync_state', arguments: {} },
});
assertAuthAwareResult('sync_state', syncState);

const progress = await post({
  jsonrpc: '2.0',
  id: 6,
  method: 'tools/call',
  params: { name: 'get_progress', arguments: { range: '90D' } },
});
assertAuthAwareResult('get_progress', progress);

const checkin = await post({
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/call',
  params: { name: 'run_daily_checkin', arguments: {} },
});
assertAuthAwareResult('run_daily_checkin', checkin);

console.log('smoke-mcp: OK');
