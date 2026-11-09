// Usage: node tools/layout.mjs [url] — with the server running, writes layout.json (stations, obstacles, hall, sauna) for the server's NPCs. Rerun after moving equipment.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url = 'http://127.0.0.1:8790/'] = process.argv.slice(2);
const script = `
  const { HALL, SAUNA } = await import('/src/world.js');
  const round = (value) => Math.round(value * 1000) / 1000;
  const stations = gym.world.interactables.filter((item) => item.kind !== 'loyly').map((item) => {
    const spot = item.spot ?? item.approach;
    return { approach: [round(item.approach.x), round(item.approach.z)], kind: item.kind, ry: round(Math.atan2(item.facing.x - spot.x, item.facing.z - spot.z)), seat: item.seatHeight ?? 0.45, spot: [round(spot.x), round(spot.z)] };
  });
  return { hall: HALL, obstacles: gym.world.obstacles.map((box) => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, round(value)]))), sauna: SAUNA, stations };
`;
const output = execFileSync('node', [new URL('./shot.mjs', import.meta.url).pathname, url, '/tmp/gym-layout.png', script], { encoding: 'utf8' });
const line = output.split('\n').find((entry) => entry.startsWith('[result] '));
if (!line) throw new Error(`No layout from the page:\n${output}`);
const layout = JSON.parse(line.slice('[result] '.length));
writeFileSync(new URL('../layout.json', import.meta.url), `${JSON.stringify(layout)}\n`);
console.log(`layout.json: ${layout.stations.length} stations, ${layout.obstacles.length} obstacles`);
