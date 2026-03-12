import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const required = [
  'CalGPT V2 Widget-First Dev Harness',
  '/component.html',
  'Refresh state',
  'State snapshot',
];

for (const token of required) {
  if (!app.includes(token)) {
    throw new Error(`UI harness missing required token: ${token}`);
  }
}

if (app.includes('type AppPage = "home" | "progress" | "settings"')) {
  throw new Error('UI shell should be simplified; found routed app shell markers');
}

console.log('check-ui-shell: OK');
