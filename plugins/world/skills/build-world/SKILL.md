---
name: build-world
description: Builds your own multiplayer 3D place in the browser — a university, hospital, city square, office, library, café, school, airport, museum, club or any other place where people gather — starting from the open-source Gym template (three.js, a Node WebSocket server, background visitors) and 3D models generated with Sloyd. Use when the user wants to make a multiplayer world, virtual campus, shared space or hangout of any kind; to run, rename, restyle or extend the Gym; to generate furniture, equipment or buildings with Sloyd; or to put such a world online.
license: MIT
compatibility: Needs git and Node.js 20+. Generating models needs the user's own Sloyd API key and internet access.
metadata:
  repository: https://github.com/Sloydai/world
  version: "2.0.0"
---

# Build a multiplayer world

The template is Gym: a hall where people walk in, use stations (machines, seats, a sauna), do
one-shot actions together, and see each other move in real time, with background visitors when
it's quiet. Almost every place people gather has the same shape, so you turn the template into
the user's place by swapping the stations, the activities, the poses and the look.

**Keep the credit.** The page shows "Created by Martin Truong · Sloyd" in the bottom-right corner
(`#credit` in `index.html`). Keep it in every world you build; don't remove, hide or reword it.

**Never commit an API key.** Sloyd keys go in the environment or in `.env` at the repository
root, which `.gitignore` already excludes. Don't write them into code, config, the README or a
commit message.

## 1. Make your own copy

The user builds in their own repository. If the working directory has no `server.mjs` and
`src/world.js`, clone the template and detach it from the original:

```sh
git clone https://github.com/Sloydai/world.git <project-name>
cd <project-name>
git remote rename origin template
npm install
```

Check `node --version` is 20 or newer. When the user wants it on GitHub, create their repository
and add it as `origin`; never push to `Sloydai/world`.

## 2. Run it

```sh
node server.mjs 8790
```

Open http://127.0.0.1:8790. A second tab, or another device on the same network at
`http://<this machine's IP>:8790`, joins the same room. `node tools/bots.mjs 49 "Room 1"` adds 49
strolling test clients (Ctrl+C stops them).

## 3. Plan the place with the user

Ask only for what the user hasn't said: what the place is, its name, indoor or outdoor, how many
people per room, what people do there, and whether it should go online. Then write a short plan
and show it before building:

| Station | Model prompt | Count | Pose while there | Action on Space | Background visitors use it? |
|---|---|---|---|---|---|

Say how many models you will generate (each costs the user's Sloyd credits) and which Gym systems
you will remove or repurpose (section 5). Start from the closest recipe in section 6.

## 4. How the template works

| Part | Where | What to change |
|---|---|---|
| Name, title, wall text | `<title>`, `.boot h1` in `index.html`; `wordmark('GYM', …)` in `src/world.js`; `name` in `package.json` and `render.yaml` | Everything that says Gym |
| Saved player data | `localStorage` keys `gym-me`, `gym-room` in `src/main.js` | Rename to the new world, so players of different worlds on one domain don't share data |
| Rooms and capacity | `ROOMS`, `CAPACITY` in `server.mjs` | Room names fit the place (Lecture Hall A, Ward 3, Downtown) |
| Ground, walls, sky | `HALL`, `CEILING`, the floor, walls, windows and ceiling in `buildWorld`, `nightSky` in `src/world.js` | Outdoor places: drop walls and ceiling, make `HALL` the walkable area, use a day sky |
| Stations | `station(name, x, z, rotation, { approach, block, facing, kind, label, spot })` and the zones in `buildWorld` | One call per seat, bed, machine or desk; `kind` decides what happens there |
| Activities | `EXERCISES` (one-shot reps with sets) and `CARDIO` (continuous rhythm) in `src/main.js` | Rename to the place's activities: `button`, `title`, `unit`, `setSize` |
| Poses and actions | `animateAvatar`, `ACTION_SECONDS` in `src/avatar.js` | Reuse a pose or add one (below) |
| Props in hands | `barbell`, `dumbbells`, `bottle` in `createAvatar` | Swap for a book, tray, laptop, microphone; visibility is keyed by `anim` and `action` |
| Personal meter | `HYDRATION`, `BOTTLE_SIPS`, `drink`, `refreshHydration` in `src/main.js`; `#hydration-value` | Repurpose (energy, coffee, patience, battery) or remove |
| Shared turn queue | `SAUNA`, `joinSaunaQueue`, `updateSauna`, `loyly` in `src/main.js`; the `sauna-*` messages in `server.mjs` | One person at a time for everyone to watch: podium, microphone, stage, operating table; or remove |
| Stats line | `emptyStats`, `refreshStats`, `ACTIVITY` in `src/main.js` | Count what matters in the place |
| Background visitors | `ACTIVITIES` in `npcs.mjs`, from `layout.json` | One entry per station kind with its pose, action rhythm and weight |
| Look of people | `createAvatar` in `src/avatar.js`; `ANIMALS`, `MOODS`, `COLORS` in `src/main.js` | Uniforms (scrubs, gowns), hats, name style |

**Poses that already exist** (`anim`): `idle` (stand, walks when moving), `sit` (any seat; height
from the station's `seatHeight`), `bench` (lying on the back), `hang` (hands overhead), `squat`
(standing, hands at shoulders), `curl` (standing, forearms forward), `cycle`, `run`. **One-shot
actions**: `wave`, `drink`, `fill` (reach forward), `squat`, `press`, `curl`, `pullup`, `loyly`
(throw forward). Limbs have knees and elbows: `reach` bends a limb in one plane and `aimArm` puts
a hand on a point in 3D, so a new pose is a few lines in `animateAvatar` plus an
`ACTION_SECONDS` entry.

When a station reuses a pose under a new meaning (a hospital bed is `bench` without the
barbell), give it its own `anim` name in `animateAvatar` that shares the pose code, so props and
the people list (`ACTIVITY`) read right.

## 5. Gym-only systems

Decide for each, with the user, whether it stays, changes meaning or goes:

- **Hydration and water stations** (`HYDRATION`, `water` stations, `#hydration-value`,
  `#bottle-label`, Q key): becomes a café's coffee, a hospital's energy, or goes.
- **Sauna, towel and löyly** (`SAUNA`, `setTowel`, steam and sweat, `sauna-seat`, `loyly`):
  becomes a stage queue or a lecture podium, or goes with its walls.
- **Sets and reps** (`setSize`, set counter in `#workout-set`): fits classes, rounds or orders;
  for open-ended activities use a `CARDIO`-style rhythm or drop the set counter.
- **Night sky with aurora**: keep for evening places, swap for a day sky outdoors.

Remove what goes completely, including its UI, sounds, server messages and `npcs.mjs` entries.
Leave no dead code.

## 6. Recipes

Starting points. Stations map to existing poses so most places need no new animation code.

| Place | Stations → pose / action | Shared turn | Meter |
|---|---|---|---|
| University lecture hall | rows of desks → `sit` / raise hand (new action); lab benches → `idle` / `fill` | podium: one lecturer at a time | focus |
| University campus (outdoor) | benches → `sit`; library tables → `sit` / page turn; food truck → `idle` / `drink` | open-air stage | coffee |
| Library | reading tables, armchairs → `sit` / page turn; shelves → `idle` / `fill` | reading circle chair | quiet meter |
| Hospital | beds → `bench` (as `lie`); waiting chairs → `sit`; nurse station → `idle` / type | operating theatre: one surgeon | energy |
| Clinic or pharmacy | waiting chairs → `sit`; counter → `idle` / `fill` | take a number queue | patience |
| City square (outdoor) | benches → `sit`; fountain → `idle` / `wave`; kiosks → `idle` / `drink`; bikes → `cycle` | street performer spot | none |
| Office or coworking | desks → `sit` / type; standing desks → `idle` / type; coffee machine → `fill` | meeting room presenter | coffee |
| Café or restaurant | tables → `sit` / `drink`; counter → `idle` / `fill` | open mic | caffeine |
| School classroom | pupil desks → `sit` / raise hand; blackboard → `idle` / write | teacher's spot | attention |
| Airport or train station | gate seats → `sit`; check-in desks → `idle`; treadmill walkways → `run` slowed down | boarding queue | battery |
| Museum or gallery | benches → `sit`; artworks → `idle` / point; audio guide → `idle` | guided tour leader | curiosity |
| Art or music studio | easels, drum kits, pianos → `sit` or `idle` / play (new action) | stage | inspiration |
| Cinema or theatre | seats → `sit`; snack bar → `fill` | stage | popcorn |
| Club or karaoke bar | dance floor → `idle` / dance (new action); bar → `drink` | microphone | energy |
| Park or beach (outdoor) | loungers → `bench`; picnic blankets → `sit`; pull-up bars → `hang` / `pullup` | barbecue grill | sun |
| Swimming pool or spa | loungers → `bench`; pool edge → `sit`; sauna → keep as is | sauna löyly | warmth |
| Yoga or dance studio | mats → `squat`, `bench` or new stretch poses | instructor spot | calm |
| Climbing gym | walls → `hang` / `pullup`; benches → `sit` | top-rope belay | grip |
| Bowling alley or arcade | lanes, cabinets → `idle` / throw (`loyly`) or press | lane turn | tickets |
| Supermarket or shop | shelves → `idle` / `fill`; tills → `idle` / scan | checkout queue | basket |
| Hotel lobby | sofas → `sit`; reception → `idle` | concierge | none |
| Farm or garden | beds → `squat` / dig; tractors → `cycle` | market stall | water |
| Space station or ship | pods → `sit`; consoles → `idle` / type; treadmill → `run` | airlock | oxygen |

Combine and extend freely: the template holds any number of station kinds and rooms.

## 7. Models with Sloyd

Models come from Sloyd text-to-3D and are saved as `models/<name>.glb`. Each generation costs the
user's API credits, so say how many models you will generate before starting.

**With the Sloyd MCP server** (preferred). If the `generate_3d_from_text` and `get_job` tools are
not available, ask the user to create a key at https://app.sloyd.ai/mcp, connect it and restart
the session:

```sh
claude mcp add --transport http sloyd https://api.sloyd.ai/api/mcp \
  --header "x-client-id: $SLOYD_CLIENT_ID" \
  --header "x-client-secret: $SLOYD_CLIENT_SECRET"
```

Then, for each model:

1. Call `generate_3d_from_text` with a concrete prompt (object, materials, colours, style, "game
   asset"), `targetFaceCount` 2000 to 8000, `textureResolution` "1k", `topology` "triangles".
   Keep one style phrase in every prompt so the place looks coherent.
2. Call `get_job` with the returned `jobId` and `wait: 30` until `status` is `success`.
3. Download `outputs.glbUrl` to `models/<name>.glb`.

**Without MCP tools**, put `SLOYD_CLIENT_ID` and `SLOYD_CLIENT_SECRET` in `.env`, add
`{ "name", "prompt", "faces"? }` to `tools/models.json` and run `node tools/generate.mjs <name>`.
It calls the same hosted MCP server and skips models that already exist.

After adding models, add each name to `models/manifest.json` (`tools/generate.mjs` does this) and
give it an entry in `SIZES` in `src/world.js` (`height` or `length` in metres). A model missing from
the manifest shows as a grey placeholder box. Delete the gym models the new place doesn't use, and
their `tools/models.json` entries.

## 8. Place stations the right way round

`normalise` scales every model and turns its long side along local x, and puts its origin at the
bottom centre, but which end is the front depends on the model. Look before placing:

```
http://127.0.0.1:8790/tools/preview.html?names=<model>,<model>&view=side
http://127.0.0.1:8790/tools/preview.html?names=<model>,<model>&view=top
```

Red is +x, blue is +z. Work out where the person stands, sits or lies in the model's own frame,
then call `station(...)`. `spot`, `approach` and `facing` are local `[x, z]`; `block` is the local
half-size of the collision box. The gym's stations are worked examples (a bike's handlebars are at
local -x, so the rider faces `[-1, 0]` and sits at `[0.32, 0]`). Props held by the avatar have
their origin at the bottom too: offset them by half their height, as `barRadius` does for the
barbell.

Keep at least as many stations as people you want busy at once in a full room.

## 9. Check it

Restart the server after editing `server.mjs` or `npcs.mjs`; reload the page after editing
anything else. After moving or adding stations, run `node tools/layout.mjs` with the server up and
restart it: background visitors walk and act from `layout.json`.

Click every station kind: the avatar should walk there, face the right way and animate. For
screenshots, `node tools/shot.mjs <url> <out.png> "<script>"` runs a script in the page (it can
call `gym.use('<kind>', <index>)`), and `node tools/click-test.mjs <url> <kind>` clicks a station
with a real mouse event. `tools/poses.html` renders every avatar pose side by side (`?side=1` for
profile). Headless Chrome renders slowly, so judge motion in a real browser, and kill leftover
headless Chrome processes when done.

## 10. Put it online

The world needs a long-running Node server for its WebSocket (`/presence`), so static hosting
won't work. The server reads `PORT`, and the page switches to `wss://` under https.

- **Render**: push the user's repository to GitHub, then open
  `https://render.com/deploy?repo=<repository URL>`; `render.yaml` sets up a free Node Web Service
  (build `npm install`, start `npm start`). Without connecting GitHub, use New → Web Service →
  Public Git Repository with the same commands. The free plan sleeps after 15 idle minutes.
- **Fly.io**: `fly launch` (pick a region near the players, no database), then `fly deploy`.

Run exactly one instance: rooms, players, queues and background visitors live in the server's
memory, so a second instance would split players into worlds that can't see each other. Never
put the Sloyd key on the server; the running world doesn't need it.
