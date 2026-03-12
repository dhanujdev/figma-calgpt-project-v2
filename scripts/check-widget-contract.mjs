import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/component.html', import.meta.url), 'utf8');
const required = [
  'window.openai?.toolOutput',
  'window.openai?.callTool',
  'window.openai?.setWidgetState',
  'openai:set_globals',
  'notifyIntrinsicHeight',
];

for (const token of required) {
  if (!html.includes(token)) {
    throw new Error(`Widget missing required integration token: ${token}`);
  }
}

console.log('check-widget-contract: OK');
