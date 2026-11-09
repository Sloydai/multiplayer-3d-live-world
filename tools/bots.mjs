// Usage: node tools/bots.mjs [count] [room] [port] — connects fake visitors that stroll around the hall, for load testing.
import WebSocket from 'ws';

const [count = 49, room = 'Room 1', port = 8790] = process.argv.slice(2);
const names = ['Elk', 'Lynx', 'Puffin', 'Reindeer', 'Fox', 'Seal', 'Owl', 'Hare', 'Wolf', 'Otter'];
let open = 0, refused = 0;

for (let i = 0; i < Number(count); i++) {
  const query = new URLSearchParams({ color: String(Math.floor(Math.random() * 0xffffff)), name: `Bot ${names[i % names.length]} ${i + 1}`, room });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/presence?${query}`);
  const pose = { anim: 'idle', cadence: 0, ry: 0, seat: 0.45, x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 20 };
  let target = { x: pose.x, z: pose.z };
  socket.on('message', (data) => {
    if (JSON.parse(data).kind === 'full') refused++;
  });
  socket.on('open', () => {
    open++;
    setInterval(() => {
      const dx = target.x - pose.x, dz = target.z - pose.z, distance = Math.hypot(dx, dz);
      if (distance < 0.3) target = { x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 20 };
      else {
        const step = Math.min(0.28, distance);
        pose.x += (dx / distance) * step;
        pose.z += (dz / distance) * step;
        pose.ry = Math.atan2(dx, dz);
      }
      socket.send(JSON.stringify({ kind: 'pose', pose }));
    }, 100);
  });
}
setTimeout(() => console.log(`${open} bots connected, ${refused} refused (room full)`), 3000);
