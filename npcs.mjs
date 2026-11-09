import fs from 'node:fs';

const ANIMALS = ['Elk', 'Lynx', 'Puffin', 'Reindeer', 'Fox', 'Seal', 'Owl', 'Hare', 'Wolf', 'Otter'];
const MOODS = ['Calm', 'Quiet', 'Steady', 'Gentle', 'Patient', 'Brave', 'Sleepy', 'Strong'];
const COLORS = [0x5b8c85, 0xc8875a, 0x7d8fb3, 0xb5656a, 0x8aa36b, 0xd2a845, 0x6f6aa8, 0x4d7ea8];
const ACTION_SECONDS = { curl: 1.4, drink: 2, fill: 2.5, press: 1.8, pullup: 1.6, squat: 1.8, wave: 2 };
const ACTIVITIES = {
  curl: { action: 'curl', anim: 'curl', reps: [10, 12], weight: 2 },
  cycle: { anim: 'cycle', cadence: [75, 95], weight: 3 },
  press: { action: 'press', anim: 'bench', reps: [6, 8], weight: 2 },
  pullup: { action: 'pullup', anim: 'hang', reps: [4, 6], weight: 1 },
  run: { anim: 'run', cadence: [145, 170], weight: 3 },
  'sauna-seat': { anim: 'sit', weight: 1.5 },
  squat: { action: 'squat', anim: 'squat', reps: [6, 8], weight: 2 },
  water: { anim: 'idle', weight: 0.6 },
};
const CELL = 0.4;
const RADIUS = 0.35;
const TICK = 0.1;
const WALK_SPEED = 1.5;

const random = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const round = (value) => Math.round(value * 100) / 100;

/** A walkable grid over the hall, with obstacles grown by a body radius, for routing NPCs around equipment. */
function buildGrid({ hall, obstacles }) {
  const columns = Math.ceil((hall.maxX - hall.minX) / CELL);
  const rows = Math.ceil((hall.maxZ - hall.minZ) / CELL);
  const blocked = new Uint8Array(columns * rows);
  const center = (index) => [hall.minX + ((index % columns) + 0.5) * CELL, hall.minZ + (Math.floor(index / columns) + 0.5) * CELL];
  for (let index = 0; index < blocked.length; index++) {
    const [x, z] = center(index);
    if (x < hall.minX + RADIUS || x > hall.maxX - RADIUS || z < hall.minZ + RADIUS || z > hall.maxZ - RADIUS) blocked[index] = 1;
    else blocked[index] = obstacles.some((box) => Math.hypot(x - Math.min(Math.max(x, box.minX), box.maxX), z - Math.min(Math.max(z, box.minZ), box.maxZ)) < RADIUS) ? 1 : 0;
  }
  const cellOf = (x, z) => Math.min(rows - 1, Math.max(0, Math.floor((z - hall.minZ) / CELL))) * columns + Math.min(columns - 1, Math.max(0, Math.floor((x - hall.minX) / CELL)));
  const free = (x, z) => !blocked[cellOf(x, z)];
  const nearestFree = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const index = queue.shift();
      if (!blocked[index]) return index;
      for (const next of [index - 1, index + 1, index - columns, index + columns]) {
        if (next >= 0 && next < blocked.length && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return start;
  };
  const clear = (from, to) => {
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (CELL / 3));
    for (let step = 1; step < steps; step++) {
      if (!free(from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps)) return false;
    }
    return true;
  };

  /** Shortest walkable route from one point to another, as straight-line waypoints. */
  function route(from, to) {
    const start = nearestFree(cellOf(...from));
    const goal = nearestFree(cellOf(...to));
    const cost = new Float32Array(blocked.length).fill(Infinity);
    const previous = new Int32Array(blocked.length).fill(-1);
    const open = [[0, start]];
    cost[start] = 0;
    const [goalX, goalZ] = center(goal);
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[best][0]) best = i;
      const [, index] = open[best];
      open[best] = open[open.length - 1];
      open.pop();
      if (index === goal) break;
      const column = index % columns;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (column + dx < 0 || column + dx >= columns) continue;
        const next = index + dz * columns + dx;
        if (next < 0 || next >= blocked.length || blocked[next]) continue;
        if (dx && dz && (blocked[index + dx] || blocked[index + dz * columns])) continue;
        const nextCost = cost[index] + (dx && dz ? Math.SQRT2 : 1);
        if (nextCost >= cost[next]) continue;
        cost[next] = nextCost;
        previous[next] = index;
        const [x, z] = center(next);
        open.push([nextCost + Math.hypot(x - goalX, z - goalZ) / CELL, next]);
      }
    }
    if (start !== goal && previous[goal] === -1) return [to];
    const cells = [];
    for (let index = goal; index !== -1; index = previous[index]) cells.unshift(center(index));
    const points = [from];
    for (let i = 1; i < cells.length; i++) {
      if (!clear(points[points.length - 1], cells[i])) points.push(cells[i - 1]);
    }
    points.push(to);
    return points.slice(1);
  }
  return { route };
}

/** Fills each room with 5 to 7 people training, minus however many real visitors are there. */
export function startNpcs(rooms, { broadcast, createId, layoutFile }) {
  const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
  const { route } = buildGrid(layout);
  const entrance = () => [3.5 + random(-2, 2), layout.hall.maxZ - 4 + random(0, 1)];

  for (const room of rooms.values()) {
    room.npcTarget = Math.floor(random(5, 8));
    room.nextArrival = 0;
    room.nextDeparture = 0;
    room.nextTargetChange = Date.now() + random(5, 15) * 60000;
  }

  const npcsIn = (room) => [...room.clients.values()].filter((client) => client.npc);
  const realCount = (room) => room.clients.size - npcsIn(room).length;

  function occupied(room, station, self = null) {
    for (const client of room.clients.values()) {
      if (client === self) continue;
      if (client.npc?.station === station) return true;
      if (client.pose && client.pose.anim !== 'idle' && Math.hypot(client.pose.x - station.spot[0], client.pose.z - station.spot[1]) < 0.35) return true;
    }
    return false;
  }

  function chooseStation(room) {
    const kinds = Object.keys(ACTIVITIES);
    let roll = Math.random() * kinds.reduce((sum, kind) => sum + ACTIVITIES[kind].weight, 0);
    const kind = kinds.find((entry) => (roll -= ACTIVITIES[entry].weight) < 0) ?? 'cycle';
    const free = layout.stations.filter((station) => station.kind === kind && !occupied(room, station));
    return free.length ? pick(free) : null;
  }

  function act(room, npc, action) {
    npc.npc.busyUntil = Date.now() + ACTION_SECONDS[action] * 1000;
    broadcast(room, { action, id: npc.id, kind: 'action' });
  }

  function walk(npc, target) {
    npc.npc.waypoints = route([npc.pose.x, npc.pose.z], target);
    npc.pose.anim = 'idle';
    npc.pose.cadence = 0;
  }

  function settle(npc, station) {
    const activity = ACTIVITIES[station.kind];
    Object.assign(npc.pose, { anim: activity.anim, ry: station.ry, seat: station.seat, x: station.spot[0], z: station.spot[1] });
    const now = Date.now();
    if (activity.cadence) {
      npc.pose.cadence = Math.round(random(...activity.cadence));
      npc.npc.leaveAt = now + random(2, 6) * 60000;
    } else if (activity.reps) {
      npc.npc.sets = Math.floor(random(2, 5));
      npc.npc.reps = Math.floor(random(activity.reps[0], activity.reps[1] + 1));
      npc.npc.nextRep = now + random(2, 5) * 1000;
    } else if (station.kind === 'water') {
      npc.npc.leaveAt = now + 7000;
      setTimeout(() => npc.npc.station === station && act(npc.npc.room, npc, 'fill'), 800);
      setTimeout(() => npc.npc.station === station && act(npc.npc.room, npc, 'drink'), 4200);
    } else npc.npc.leaveAt = now + random(2, 5) * 60000;
  }

  function getUp(npc) {
    const station = npc.npc.station;
    npc.npc.station = null;
    Object.assign(npc.pose, { anim: 'idle', cadence: 0, seat: 0.45, x: station.approach[0], z: station.approach[1] });
    npc.npc.idleUntil = Date.now() + random(3, 12) * 1000;
    if (Math.random() < 0.4 && station.kind !== 'water') setTimeout(() => act(npc.npc.room, npc, 'drink'), 1500);
  }

  function goTo(room, npc) {
    const station = chooseStation(room);
    if (!station) {
      npc.npc.idleUntil = Date.now() + 5000;
      return;
    }
    npc.npc.station = station;
    npc.npc.arriving = true;
    walk(npc, station.approach);
  }

  function create(room, atStation) {
    const taken = new Set([...room.clients.values()].map((client) => client.name));
    let name = `${pick(MOODS)} ${pick(ANIMALS)}`;
    for (let tries = 0; taken.has(name) && tries < 20; tries++) name = `${pick(MOODS)} ${pick(ANIMALS)}`;
    const [x, z] = entrance();
    const npc = { away: false, color: pick(COLORS), id: createId(), name, npc: { busyUntil: 0, idleUntil: 0, room, station: null, waypoints: [] }, pose: { anim: 'idle', cadence: 0, ry: Math.PI, seat: 0.45, x: round(x), z: round(z) }, socket: null };
    const station = atStation ? chooseStation(room) : null;
    if (station) {
      npc.npc.station = station;
      settle(npc, station);
    } else npc.npc.idleUntil = Date.now() + random(1, 3) * 1000;
    room.clients.set(npc.id, npc);
    const { away, color, id, pose } = npc;
    broadcast(room, { kind: 'join', player: { away, color, id, name, pose } });
  }

  function remove(room, npc) {
    npc.npc.station = null;
    room.clients.delete(npc.id);
    broadcast(room, { id: npc.id, kind: 'leave' });
  }

  function step(room, npc, now) {
    const state = npc.npc;
    if (state.waypoints.length) {
      const [targetX, targetZ] = state.waypoints[0];
      const dx = targetX - npc.pose.x, dz = targetZ - npc.pose.z, distance = Math.hypot(dx, dz);
      const move = Math.min(distance, WALK_SPEED * TICK);
      if (distance > 1e-3) {
        npc.pose.x = round(npc.pose.x + (dx / distance) * move);
        npc.pose.z = round(npc.pose.z + (dz / distance) * move);
        npc.pose.ry = round(Math.atan2(dx, dz));
      }
      if (distance - move < 0.05) state.waypoints.shift();
      if (state.waypoints.length) return;
      if (state.leaving) return remove(room, npc);
      if (state.arriving) {
        state.arriving = false;
        if (state.retiring || occupied(room, state.station, npc)) {
          state.station = null;
          state.idleUntil = now + 2000;
          return;
        }
        settle(npc, state.station);
      }
      return;
    }
    if (now < state.busyUntil) return;
    const station = state.station;
    if (station) {
      const activity = ACTIVITIES[station.kind];
      if (activity.cadence) npc.pose.cadence = Math.round(Math.min(activity.cadence[1] + 10, Math.max(activity.cadence[0] - 10, npc.pose.cadence + random(-2, 2))));
      if (activity.reps && now >= state.nextRep) {
        act(room, npc, activity.action);
        state.reps--;
        if (state.reps > 0) state.nextRep = now + ACTION_SECONDS[activity.action] * 1000 + random(300, 1200);
        else if (--state.sets > 0) {
          state.reps = Math.floor(random(activity.reps[0], activity.reps[1] + 1));
          state.nextRep = now + random(25, 60) * 1000;
        } else state.leaveAt = now + random(2, 6) * 1000;
      }
      if (state.leaveAt && now >= state.leaveAt) {
        state.leaveAt = 0;
        getUp(npc);
      }
      return;
    }
    if (now < state.idleUntil) return;
    if (state.retiring) {
      state.leaving = true;
      walk(npc, entrance());
    } else goTo(room, npc);
  }

  function balance(room, now) {
    if (now >= room.nextTargetChange) {
      room.npcTarget = Math.floor(random(5, 8));
      room.nextTargetChange = now + random(5, 15) * 60000;
    }
    const npcs = npcsIn(room).filter((npc) => !npc.npc.retiring);
    const wanted = Math.max(0, room.npcTarget - realCount(room));
    if (npcs.length > wanted) {
      if (now < room.nextDeparture) return;
      room.nextDeparture = now + random(60, 180) * 1000;
      const npc = npcs.find((entry) => !entry.npc.station) ?? pick(npcs);
      npc.npc.retiring = true;
      if (npc.npc.station && !npc.npc.arriving) npc.npc.leaveAt = Math.min(npc.npc.leaveAt || Infinity, now + random(5, 30) * 1000);
      if (npc.npc.station && ACTIVITIES[npc.npc.station.kind].reps) {
        npc.npc.sets = 1;
        npc.npc.reps = Math.min(npc.npc.reps, 2);
      }
    } else if (npcs.length < wanted && now >= room.nextArrival) {
      create(room, false);
      room.nextArrival = now + random(15, 60) * 1000;
    }
  }

  for (const room of rooms.values()) for (let i = 0; i < room.npcTarget; i++) create(room, true);

  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      balance(room, now);
      for (const npc of npcsIn(room)) step(room, npc, now);
    }
  }, TICK * 1000);

  /** Someone real walked in: now and then one of the idle or resting NPCs waves hello. */
  return function greet(room) {
    room.nextDeparture = Math.max(room.nextDeparture, Date.now() + random(60, 180) * 1000);
    if (Math.random() > 0.5) return;
    setTimeout(() => {
      const candidates = npcsIn(room).filter((npc) => !npc.npc.waypoints.length && (!npc.npc.station || npc.npc.station.kind === 'sauna-seat'));
      if (candidates.length) act(room, pick(candidates), 'wave');
    }, random(2, 6) * 1000);
  };
}
