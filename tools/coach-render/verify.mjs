// Verify a rendered clip by PLAYING it (fragmented MP4/WebM from MediaRecorder
// isn't seekable, so we measure real content via requestVideoFrameCallback):
// reports true played duration + frame count, and saves start/mid/end frames.
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "../../artifacts/soccer-trainer/public/videos");
const tag = process.argv[2] || "toe-taps-front";

// find the actual file (mp4 or webm)
const files = await readdir(OUT);
const fname = files.find((f) => f.startsWith(tag + "."));
if (!fname) { console.error(`no file for ${tag} in ${OUT}`); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (url) => {
  const v = document.createElement("video");
  v.src = url; v.muted = true; v.playsInline = true; v.loop = false;
  document.body.appendChild(v);
  await new Promise((res, rej) => {
    v.onloadeddata = res;
    v.onerror = () => rej(new Error("load error: " + (v.error && v.error.code)));
    setTimeout(() => rej(new Error("load timeout")), 15000);
  });
  const w = v.videoWidth, h = v.videoHeight;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const shots = [];
  let frames = 0, lastT = 0;
  const useRVFC = "requestVideoFrameCallback" in v;
  await new Promise((resolve) => {
    const done = () => resolve();
    v.onended = done;
    setTimeout(done, 12000); // safety
    if (useRVFC) {
      const onFrame = (_now, meta) => {
        frames++; lastT = meta.mediaTime;
        // capture ~6 evenly-spaced frames
        if (frames % 3 === 1) { ctx.drawImage(v, 0, 0); shots.push({ t: meta.mediaTime, png: c.toDataURL("image/png") }); }
        if (!v.ended) v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    }
    v.play();
  });
  return { w, h, frames, lastT, useRVFC, shots: shots.slice(0, 6) };
}, `${BASE}/videos/${fname}`);

console.log(`video ${fname}: ${result.w}x${result.h}, played ${result.frames} frames, last frame t=${result.lastT?.toFixed(2)}s (rVFC=${result.useRVFC})`);
let i = 0;
for (const s of result.shots) {
  const b64 = s.png.replace(/^data:image\/png;base64,/, "");
  const out = path.resolve(__dirname, `frame-${tag}-${String(i).padStart(2, "0")}-t${s.t.toFixed(2)}.png`);
  await writeFile(out, Buffer.from(b64, "base64"));
  console.log(`  frame ${i} @ ${s.t.toFixed(2)}s -> ${path.basename(out)}`);
  i++;
}
await browser.close();
