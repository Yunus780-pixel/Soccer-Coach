// Offline coach-video renderer.
//
// For each drill × camera angle: opens the dev server's /__preview in headless
// Chrome, steps the animation phase from 0→1 capturing one exact frame per
// step (deterministic, so the loop is perfectly seamless), then encodes the
// frames into a small H.264 MP4 with ffmpeg (plays everywhere, incl. iPhone).
// This is an offline build tool — nothing here ships in the app.
//
// Usage:
//   node render.mjs                     # all drills, all angles
//   node render.mjs toe-taps            # one drill, all angles
//   node render.mjs toe-taps front      # one drill, one angle
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.OUT_DIR || path.resolve(__dirname, "../../artifacts/soccer-trainer/public/videos");
const W = Number(process.env.WIDTH) || 800; // matches the coach panel's 4:3
const H = Number(process.env.HEIGHT) || 600;
const FPS = Number(process.env.FPS) || 30;

// Drill display name (must match the DB / motions registry) → output file slug.
const ALL_DRILLS = [
  { name: "Toe Taps", slug: "toe-taps" },
  { name: "Power Strike Form", slug: "power-strike-form" },
  { name: "Juggling Starter", slug: "juggling-starter" },
];
const ALL_ANGLES = ["front", "side", "back"];

const [argDrill, argAngle] = process.argv.slice(2);
const drills = argDrill ? ALL_DRILLS.filter((d) => d.slug === argDrill) : ALL_DRILLS;
const angles = argAngle ? [argAngle] : ALL_ANGLES;
if (!drills.length) {
  console.error(`No drill matches "${argDrill}". Known: ${ALL_DRILLS.map((d) => d.slug).join(", ")}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrames = () =>
  // wait two animation frames so the new phase is definitely rendered
  page$.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));

let page$; // current page (used by helpers)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    `--window-size=${W},${H}`,
  ],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});

await mkdir(OUT, { recursive: true });
let ok = 0, failed = 0;

for (const d of drills) {
  for (const a of angles) {
    const tag = `${d.slug}-${a}`;
    const tmp = path.join(os.tmpdir(), `coach-${tag}`);
    const page = await browser.newPage();
    page$ = page;
    try {
      await rm(tmp, { recursive: true, force: true });
      await mkdir(tmp, { recursive: true });

      const url = `${BASE}/__preview?drill=${encodeURIComponent(d.name)}&cam=${a}&record=1&still=1`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
      await page.waitForSelector("canvas", { timeout: 30_000 });

      // Wait until the model is actually drawn (frame is no longer near-black).
      const period = await waitForRender(page);
      const N = Math.max(2, Math.round(period * FPS));

      for (let i = 0; i < N; i++) {
        await page.evaluate((p) => { window.__coachPhase = p; }, i / N);
        await nextFrames();
        const dataUrl = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
        const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        await writeFile(path.join(tmp, `frame${String(i).padStart(4, "0")}.png`), Buffer.from(b64, "base64"));
      }

      const file = path.join(OUT, `${tag}.mp4`);
      await execFileP(ffmpegPath, [
        "-y",
        "-framerate", String(FPS),
        "-i", path.join(tmp, "frame%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",       // required for Safari/QuickTime
        "-profile:v", "high",
        "-crf", "20",
        "-preset", "slow",
        "-movflags", "+faststart",   // metadata up front → instant start + seekable
        "-an",
        "-r", String(FPS),
        file,
      ]);
      console.log(`OK   ${tag}  ${N} frames @ ${FPS}fps (${(period).toFixed(2)}s loop)`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${tag}: ${e.message}`);
      failed++;
    } finally {
      await rm(tmp, { recursive: true, force: true });
      await page.close();
    }
  }
}

await browser.close();
console.log(`\nDone. ${ok} rendered, ${failed} failed. Output: ${OUT}`);
process.exit(failed ? 1 : 0);

// ── helpers ────────────────────────────────────────────────────────────────
async function waitForRender(page) {
  // Poll until the canvas has a clearly-lit subject (the model loaded + IK ran),
  // then return the drill's loop period (set by the component on window).
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await nextFrames();
    const info = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return { ready: false, bright: 0, period: 0 };
      const o = document.createElement("canvas");
      o.width = 80; o.height = 60;
      const ctx = o.getContext("2d");
      ctx.drawImage(c, 0, 0, 80, 60);
      const data = ctx.getImageData(0, 0, 80, 60).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      const bright = sum / (data.length / 4 * 3);
      return { ready: bright > 25, bright, period: window.__coachPeriod || 0 };
    });
    if (info.ready && info.period > 0) return info.period;
    await sleep(200);
  }
  throw new Error("model never rendered (canvas stayed dark)");
}
