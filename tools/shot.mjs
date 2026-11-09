// Usage: node tools/shot.mjs <url> <out.png> [script run after load] — logs page errors.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, script = ''] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/gym-shot-${port}`, '--window-size=1400,900', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
process.on('exit', () => chrome.kill());
process.on('uncaughtException', (error) => { console.log('[error]', error.message); process.exit(1); });
setTimeout(() => process.exit(1), 120000).unref();
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') console.log('[exception]', message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) console.log(`[${message.params.type}]`, message.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
for (let i = 0; i < 120; i++) {
  await sleep(250);
  if ((await send('Runtime.evaluate', { expression: 'Boolean(window.gym)', returnByValue: true })).result?.value) break;
}
if (script) {
  const result = await send('Runtime.evaluate', { awaitPromise: true, expression: `(async () => { ${script} })()`, returnByValue: true });
  if (result.exceptionDetails) console.log('[script]', result.exceptionDetails.exception?.description);
  else if (result.result?.value !== undefined) console.log('[result]', JSON.stringify(result.result.value));
}
await sleep(1500);
const { data } = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(data, 'base64'));
ws.close();
chrome.kill();
process.exit(0);
