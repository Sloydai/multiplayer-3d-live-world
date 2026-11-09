import fs from 'node:fs';
import { callTool } from './sloyd-mcp.mjs';

const root = new URL('..', import.meta.url).pathname;
const jobs = JSON.parse(fs.readFileSync(`${root}tools/models.json`, 'utf8'));
const only = process.argv.slice(2);
const queue = jobs.filter((job) => (only.length ? only.includes(job.name) : true) && !fs.existsSync(`${root}models/${job.name}.glb`));
console.log(`${queue.length} of ${jobs.length} models to generate`);

async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      let jobId;
      while (!jobId) {
        try {
          ({ jobId } = await callTool('generate_3d_from_text', { prompt: job.prompt, targetFaceCount: job.faces ?? 8000, textureResolution: '1k', topology: 'triangles' }));
        } catch (err) {
          if (!err.message.includes('429')) throw err;
          await new Promise((resolve) => setTimeout(resolve, 20000));
        }
      }
      console.log(`${job.name}: job ${jobId}`);
      let result;
      do result = await callTool('get_job', { jobId, wait: 30 });
      while (!['success', 'error', 'failed'].includes(result.status));
      if (result.status !== 'success') throw new Error(`job ${jobId} ${result.status}: ${JSON.stringify(result).slice(0, 300)}`);
      const glb = await fetch(result.outputs.glbUrl);
      if (!glb.ok) throw new Error(`download: HTTP ${glb.status}`);
      fs.writeFileSync(`${root}models/${job.name}.glb`, Buffer.from(await glb.arrayBuffer()));
      console.log(`${job.name}: saved`);
    } catch (err) {
      console.error(`${job.name}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
fs.writeFileSync(`${root}models/manifest.json`, JSON.stringify(jobs.map((job) => job.name).filter((name) => fs.existsSync(`${root}models/${name}.glb`))));
