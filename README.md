# Multiplayer 3D Live World

Build your own multiplayer 3D place in the browser: a university, hospital, city square, office, library, café, school, airport, club or anything else where people gather. People walk in, use stations, act together in real time, and background visitors keep each room lively when it's quiet.

This repository is a Claude Code plugin with one skill, `build-world`, plus the template it starts from: a small multiplayer gym built with [three.js](https://threejs.org) and 3D models generated with [Sloyd](https://www.sloyd.ai).

## Build your world with Claude Code

```
/plugin marketplace add Sloydai/multiplayer-3d-live-world
/plugin install world@world
```

Then ask, for example:

- "Build a university lecture hall with a podium where one person speaks at a time"
- "Make a hospital ward with beds, a waiting room and a nurse station"
- "Turn this into a city square with benches, kiosks and a fountain"

The skill copies the template into your own project, plans the place with you, generates the models through the Sloyd MCP server with your own API key, sets up stations, poses and background visitors, and helps you put it online.

## Run the template

```bash
npm install
node server.mjs 8790
```

Open http://127.0.0.1:8790. Open a second tab, or another device on the same network, to join the same room.

## Models

New models come from the hosted Sloyd MCP server (`https://api.sloyd.ai/api/mcp`) and use your own key and credits; get one at [app.sloyd.ai/mcp](https://app.sloyd.ai/mcp). The running world never needs a key.

```bash
echo 'SLOYD_CLIENT_ID=...' >> .env
echo 'SLOYD_CLIENT_SECRET=...' >> .env
node tools/generate.mjs <name>   # names and prompts in tools/models.json
```

`.env` is git-ignored. Never commit it.

## Put it online

The world needs a long-running Node server for its WebSocket, so use a host such as [Render](https://render.com) (free Web Service, build `npm install`, start `npm start`; `render.yaml` is included) or [Fly.io](https://fly.io). Run a single instance: rooms and players live in the server's memory.

## Credits

Created by Martin Truong · [Sloyd](https://www.sloyd.ai). MIT licensed, see [LICENSE](LICENSE).
