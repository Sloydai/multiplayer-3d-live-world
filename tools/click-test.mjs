// Usage: node tools/click-test.mjs <url> <kind> — clicks the first station of that kind with a real mouse event, then reports where the player ended up.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, kind, out = 'shots/click.png'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/gym-click-${port}`, '--window-size=1400,900', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
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
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
  if (message.method === 'Runtime.exceptionThrown') console.log('[exception]', message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { awaitPromise: true, expression, returnByValue: true })).result?.value;
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
await send('Runtime.enable');
await send('Page.navigate', { url });
for (let i = 0; i < 120 && !(await evaluate('Boolean(window.gym)')); i++) await sleep(250);
await sleep(1000);
const point = await evaluate(`(() => {
  const g = gym;
  const item = g.world.interactables.find((entry) => entry.kind === '${kind}');
  const anchor = item.spot ?? item.object.position.clone().setY(0);
  const away = item.approach.clone().sub(anchor).setY(0).normalize().multiplyScalar(1.5);
  g.player.position.copy(item.approach).add(away);
  g.view.yaw = Math.atan2(g.player.position.x - item.object.position.x, g.player.position.z - item.object.position.z);
  g.view.distance = 4; g.view.pitch = 0.12;
  return new Promise((resolve) => setTimeout(() => {
    const v = item.object.getWorldPosition(item.approach.clone()); v.project(g.camera);
    resolve({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, top: document.elementFromPoint((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight)?.id || document.elementFromPoint((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight)?.className });
  }, 1500));
})()`);
console.log('click at', JSON.stringify(point));
console.log('hits', await evaluate(`(() => { const g = gym; const rc = new g.Raycaster(); rc.setFromCamera({ x: ${'${point.x}'} / innerWidth * 2 - 1, y: -(${'${point.y}'} / innerHeight) * 2 + 1 }, g.camera); const objs = [...new Set(g.world.interactables.map(i => i.object))]; return JSON.stringify(rc.intersectObjects([...objs, g.world.floor], true).slice(0, 4).map(h => [h.object.type, h.distance.toFixed(2), g.world.interactables.find(i => i.object === h.object)?.kind])); })()`));
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { button: 'left', clickCount: 1, type, x: point.x, y: point.y });
await sleep(14000);
console.log('after', await evaluate(`JSON.stringify({ anim: gym.player.anim, station: gym.player.station?.kind, x: gym.player.position.x.toFixed(2), z: gym.player.position.z.toFixed(2), waypoints: gym.player.waypoints.length })`));
const { data } = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(data, 'base64'));
ws.close();
chrome.kill();
process.exit(0);
