// Calls the hosted Sloyd MCP server (https://api.sloyd.ai/api/mcp). The API key comes from the
// environment or from .env in the repository root (never committed): SLOYD_CLIENT_ID, SLOYD_CLIENT_SECRET.
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const file = fs.existsSync(`${root}.env`) ? fs.readFileSync(`${root}.env`, 'utf8') : '';
const env = { ...Object.fromEntries(file.split('\n').map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/^["']|["']$/g, '')])), ...process.env };
if (!env.SLOYD_CLIENT_ID || !env.SLOYD_CLIENT_SECRET) throw new Error('Set SLOYD_CLIENT_ID and SLOYD_CLIENT_SECRET in the environment or in .env (keys from https://www.sloyd.ai/api).');
const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'x-client-id': env.SLOYD_CLIENT_ID, 'x-client-secret': env.SLOYD_CLIENT_SECRET };
let id = 0;

export async function rpc(method, params) {
  const res = await fetch('https://api.sloyd.ai/api/mcp', { body: JSON.stringify({ id: ++id, jsonrpc: '2.0', method, params }), headers, method: 'POST' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const line = text.trim().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).pop().slice(5);
  const message = JSON.parse(line);
  if (message.error) throw new Error(`${method}: ${JSON.stringify(message.error)}`);
  return message.result;
}

export const callTool = async (name, args) => {
  const result = await rpc('tools/call', { arguments: args, name });
  const text = result.content?.map((c) => c.text).join('\n') ?? '';
  if (result.isError) throw new Error(`${name}: ${text}`);
  return result.structuredContent ?? JSON.parse(text);
};

if (process.argv[2] === 'list') {
  const { tools } = await rpc('tools/list', {});
  for (const tool of tools) console.log(tool.name, JSON.stringify(tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : []));
}
