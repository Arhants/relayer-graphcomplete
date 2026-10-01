import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);
export function createProjectSidebarDemoVideo(output) {
  let frames;
  const initializeFrames = async () => { if (!frames) { await mkdir(dirname(output), { recursive: true }); frames = await mkdtemp(join(dirname(output), 'demo-frames-')); } };
  let index = 0;
  const captions = [];
  return {
    async scene(webContents, caption, action = async () => {}) {
      await initializeFrames();
      await webContents.executeJavaScript(`(() => { let caption = document.createElement('div'); caption.id = 'project-sidebar-demo-caption'; caption.textContent = ${JSON.stringify(caption)}; caption.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:14px;background:#111e;color:white;font:22px system-ui;text-align:center;pointer-events:none'; document.body.append(caption); })()`);
      const start = index / 10;
      for (let frame = 0; frame < 30; frame++) {
        const began = Date.now();
        if (frame === 5) await action();
        await writeFile(join(frames, `${String(index++).padStart(5, '0')}.png`), (await webContents.capturePage()).toPNG());
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 100 - (Date.now() - began))));
      }
      await webContents.executeJavaScript("document.querySelector('#project-sidebar-demo-caption')?.remove()");
      captions.push({ start, end: index / 10, caption });
    },
    async finish() {
      const timestamp = value => { const ms = Math.round(value * 1000); return `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
      const subtitle = join(dirname(output), 'demo.srt');
      await writeFile(subtitle, captions.map((s, i) => `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${s.caption}\n`).join('\n'));
      await run(process.env.RELAYER_EVIDENCE_FFMPEG || '/opt/homebrew/bin/ffmpeg', ['-y', '-framerate', '10', '-i', join(frames, '%05d.png'), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { maxBuffer: 4 * 1024 * 1024 });
      const rendererRoot = resolve(import.meta.dirname, '../desktop/renderer');
      const rendererFiles = {};
      const collect = async directory => { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await collect(path); else if (entry.isFile()) rendererFiles[path.slice(rendererRoot.length + 1)] = sha256(await readFile(path)); } };
      await collect(rendererRoot);
      const rendererDigest = sha256(JSON.stringify(Object.entries(rendererFiles).sort(([a], [b]) => a.localeCompare(b))));
      await writeFile(join(dirname(output), 'demo-scenes.json'), JSON.stringify({ output, videoSha256: sha256(await readFile(output)), framesDirectory: frames, rendererDigest, rendererFiles, driverSha256: sha256(await readFile(resolve(import.meta.dirname, "test-desktop-project-new-thread.mjs"))), recorderSha256: sha256(await readFile(import.meta.filename)), captions, frames: index, fps: 10, context: 'Production renderer with deterministic local native fixture. Renderer window, Rust server and settings store restart; Electron main remains alive.' }, null, 2));
    },
  };
}
