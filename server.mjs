import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { startNpcs } from './npcs.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const port = Number(process.argv[2] || process.env.PORT || 8790);
const CAPACITY = 70;
const LOYLY_SECONDS = 8;
const ROOMS = ['Room 1', 'Room 2', 'Room 3', 'Room 4'];

const mime = { '.css': 'text/css', '.glb': 'model/gltf-binary', '.html': 'text/html', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const rooms = new Map(ROOMS.map((name) => [name, { clients: new Map(), sauna: { current: null, queue: [] } }]));
let nextId = 1;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/rooms') {
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
    response.end(JSON.stringify(ROOMS.map((name) => ({ capacity: CAPACITY, count: rooms.get(name).clients.size, name }))));
    return;
  }
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

const wss = new WebSocketServer({ path: '/presence', server });

function send(client, message) {
  if (client.socket?.readyState === 1) client.socket.send(JSON.stringify(message));
}

function broadcast(room, message) {
  for (const client of room.clients.values()) send(client, message);
}

function publicState(client) {
  const { away, color, id, name, pose } = client;
  return { away, color, id, name, pose };
}

function saunaState(room) {
  return { current: room.sauna.current?.id ?? null, queue: room.sauna.queue };
}

function advanceSauna(room) {
  if (!room.sauna.current && room.sauna.queue.length) {
    const id = room.sauna.queue.shift();
    room.sauna.current = { id, timer: setTimeout(() => finishSauna(room, id), (LOYLY_SECONDS + 20) * 1000) };
  }
  broadcast(room, { kind: 'sauna', ...saunaState(room) });
}

function finishSauna(room, id) {
  if (room.sauna.current?.id !== id) return;
  clearTimeout(room.sauna.current.timer);
  room.sauna.current = null;
  advanceSauna(room);
}

function leaveSauna(room, id) {
  room.sauna.queue = room.sauna.queue.filter((queued) => queued !== id);
  if (room.sauna.current?.id === id) finishSauna(room, id);
  else broadcast(room, { kind: 'sauna', ...saunaState(room) });
}

wss.on('connection', (socket, request) => {
  const url = new URL(request.url, 'http://localhost');
  const roomName = ROOMS.includes(url.searchParams.get('room')) ? url.searchParams.get('room') : ROOMS[0];
  const room = rooms.get(roomName);
  if ([...room.clients.values()].filter((entry) => !entry.npc).length >= CAPACITY) {
    socket.send(JSON.stringify({ kind: 'full' }));
    socket.close();
    return;
  }
  const client = {
    away: false,
    color: Number(url.searchParams.get('color')) || 0x5b8c85,
    id: String(nextId++),
    name: (url.searchParams.get('name') || 'Guest').slice(0, 24),
    pose: null,
    socket,
  };
  room.clients.set(client.id, client);
  send(client, { id: client.id, kind: 'welcome', players: [...room.clients.values()].map(publicState), room: roomName, sauna: saunaState(room) });
  broadcast(room, { kind: 'join', player: publicState(client) });
  greet(room);

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.kind === 'pose') client.pose = message.pose;
    else if (message.kind === 'away') {
      client.away = Boolean(message.away);
      broadcast(room, { away: client.away, id: client.id, kind: 'away' });
    } else if (message.kind === 'action') broadcast(room, { action: String(message.action).slice(0, 16), id: client.id, kind: 'action' });
    else if (message.kind === 'sauna-join') {
      if (room.sauna.current?.id !== client.id && !room.sauna.queue.includes(client.id)) room.sauna.queue.push(client.id);
      advanceSauna(room);
    } else if (message.kind === 'sauna-leave') leaveSauna(room, client.id);
    else if (message.kind === 'loyly' && room.sauna.current?.id === client.id) {
      broadcast(room, { id: client.id, kind: 'loyly' });
      setTimeout(() => finishSauna(room, client.id), LOYLY_SECONDS * 1000);
    }
  });

  socket.on('close', () => {
    room.clients.delete(client.id);
    leaveSauna(room, client.id);
    broadcast(room, { id: client.id, kind: 'leave' });
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.clients.size) continue;
    const poses = [...room.clients.values()].filter((client) => client.pose).map((client) => [client.id, client.pose]);
    broadcast(room, { kind: 'poses', poses });
  }
}, 100);

const greet = startNpcs(rooms, { broadcast, createId: () => String(nextId++), layoutFile: path.join(root, 'layout.json') });

server.listen(port, () => console.log(`Gym on http://127.0.0.1:${port}`));
