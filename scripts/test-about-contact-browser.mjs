// Browser checks for about.html / contact.html, driven over the Chrome DevTools
// Protocol so no npm dependencies are needed.
// Usage: node scripts/test-about-contact-browser.mjs
//   CHROMIUM=/path/to/chromium  browser binary (default: chromium on PATH)
//   SHOTS_DIR=/some/dir         also save light/dark/mobile/error screenshots
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = process.env.SHOTS_DIR || '';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lane3-chrome-'));
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
chrome.on('error', (e) => { console.error('FAIL: could not start Chromium: ' + e.message); process.exit(1); });

const portFile = path.join(prof, 'DevToolsActivePort');
for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
if (!fs.existsSync(portFile)) { console.error('FAIL: Chromium did not start (sandboxed shell? try outside it, or SKIP_BROWSER=1)'); chrome.kill(); process.exit(1); }
const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/mailto/.test(m.params.entry.text)) problems.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(expr + ' -> ' + r.exceptionDetails.text); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const goto = async (p) => { await send('Page.navigate', { url: `file://${root}/${p}` }); await sleep(400); };
const shot = async (name, w = 1280) => { if (!shotsDir) return; await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); const h = await js('document.documentElement.scrollHeight'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); const { data } = await send('Page.captureScreenshot'); fs.writeFileSync(path.join(shotsDir, name + '.png'), Buffer.from(data, 'base64')); };
const key = async (k, code, kc, shift = false) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: kc, modifiers: shift ? 8 : 0 }); await sleep(50); };
const tab = () => key('Tab', 'Tab', 9);
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

for (const p of ['about.html', 'contact.html']) {
  for (const w of [1280, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
    await goto(p);
    const overflow = await js('document.documentElement.scrollWidth > window.innerWidth');
    check(`${p}@${w}: no horizontal scroll`, !overflow);
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await goto(p); await shot(p.replace('.html', '') + '-light');
  await shot(p.replace('.html', '') + '-light-375', 375);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await goto(p); await shot(p.replace('.html', '') + '-dark');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // Keyboard: first Tab lands on the visible skip link with a focus outline.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await goto(p); await tab();
  const skip = await js(`(() => { const a = document.activeElement, cs = getComputedStyle(a), r = a.getBoundingClientRect(); return { cls: a.className, top: r.top, outline: cs.outlineStyle + ' ' + cs.outlineWidth }; })()`);
  check(`${p}: Tab focuses visible skip link`, skip.cls === 'skip-link' && skip.top >= 0 && skip.outline.startsWith('solid'), JSON.stringify(skip));
  await key('Enter', 'Enter', 13);
  await sleep(100);
  check(`${p}: skip link moves focus to main`, (await js('document.activeElement.id')) === 'main');
  await tab();
  const next = await js(`(() => { const a = document.activeElement; return { tag: a.tagName, outline: getComputedStyle(a).outlineStyle, inMain: !!a.closest('main') }; })()`);
  check(`${p}: next Tab stays in main with visible outline`, next.inMain && next.outline === 'solid', JSON.stringify(next));
}

// Contact form behaviour.
await goto('contact.html');
check('form: status region empty and unstyled at load', await js(`document.getElementById('form-status').textContent === '' && getComputedStyle(document.getElementById('form-status')).borderStyle === 'none'`));
await js(`document.querySelector('#contact-form button[type=submit]').click()`);
await sleep(100);
const empty = await js(`({ shown: !document.getElementById('form-errors').hidden, focused: document.activeElement.id, items: [...document.querySelectorAll('#form-errors li')].map(l => l.textContent), invalid: [...document.querySelectorAll('[aria-invalid=true]')].map(e => e.id), inline: ['name','email','topic','message'].map(f => document.getElementById(f + '-error').textContent) })`);
check('form: empty submit shows summary', empty.shown && empty.items.length === 4, JSON.stringify(empty.items));
check('form: summary receives focus', empty.focused === 'form-errors', empty.focused);
check('form: all 4 fields marked aria-invalid', empty.invalid.join() === 'name,email,topic,message', empty.invalid.join());
check('form: inline errors rendered', empty.inline.every(Boolean));
await shot('contact-errors');
await js(`document.querySelector('#form-errors a[data-field=email]').click()`);
check('form: summary link focuses field', (await js('document.activeElement.id')) === 'email');

// Typing a fix clears the inline error live.
await js(`(() => { const e = document.getElementById('email'); e.value = 'ada@example.com'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
check('form: fixing email clears its error live', (await js(`document.getElementById('email').getAttribute('aria-invalid') === null && document.getElementById('email-error').textContent === ''`)));
await js(`(() => { const m = document.getElementById('message'); m.value = 'short'; m.dispatchEvent(new Event('input', { bubbles: true })); })()`);
check('form: counter updates', (await js(`document.getElementById('message-counter').textContent`)) === '5 / 2000');
check('form: short message error is specific', /currently 5/.test(await js(`document.getElementById('message-error').textContent`)));

// Valid submit: mailto hand-off is attempted, success status announced, summary hidden.
await js(`(() => { const f = document.getElementById('contact-form'); f.name.value = 'Ada Lovelace'; f.topic.value = 'project'; f.message.value = 'I would like to talk about a project.'; })()`);
await js(`document.querySelector('#contact-form button[type=submit]').click()`);
await sleep(200);
const ok = await js(`({ status: document.getElementById('form-status').textContent, cls: document.getElementById('form-status').className, summaryHidden: document.getElementById('form-errors').hidden, invalid: document.querySelectorAll('[aria-invalid=true]').length })`);
check('form: valid submit shows success status', /email app should open/.test(ok.status) && ok.cls.includes('alert-success'), ok.status);
check('form: valid submit hides summary and errors', ok.summaryHidden && ok.invalid === 0);
await shot('contact-success');

// Honeypot: filled -> nothing sent, form reset.
await goto('contact.html');
await js(`(() => { const f = document.getElementById('contact-form'); f.name.value = 'Bot'; f.website.value = 'http://spam'; })()`);
await js(`document.querySelector('#contact-form button[type=submit]').click()`);
await sleep(100);
check('form: honeypot submit resets silently', (await js(`document.getElementById('name').value === '' && document.getElementById('form-errors').hidden`)));

check('no console errors or exceptions', problems.length === 0, problems.join(' | '));
console.log(results.join('\n'));
ws.close(); chrome.kill();
fs.rmSync(prof, { recursive: true, force: true });
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
