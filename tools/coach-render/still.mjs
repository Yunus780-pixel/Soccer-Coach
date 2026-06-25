// Quick visual check: screenshot a frozen frame of the live /__preview.
// Usage: node still.mjs "<drill>" <front|side|back> <phase> <outName>
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL || "http://localhost:3000";

const drill = process.argv[2] || "toe taps";
const cam = process.argv[3] || "front";
const phase = process.argv[4] || "0.35";
const out = path.resolve(__dirname, (process.argv[5] || "still") + ".png");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--window-size=700,700"],
  defaultViewport: { width: 700, height: 700, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const stanceQ = process.env.STANCE ? `&stance=${process.env.STANCE}` : "";
const url = `${BASE}/__preview?drill=${encodeURIComponent(drill)}&cam=${cam}&phase=${phase}&still=1${stanceQ}`;
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

// wait until the model is drawn (frame no longer near-black)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 50; i++) {
  await sleep(250);
  const bright = await page.evaluate(() => {
    const c = document.querySelector("canvas"); if (!c) return 0;
    const o = document.createElement("canvas"); o.width = 60; o.height = 60;
    const x = o.getContext("2d"); x.drawImage(c, 0, 0, 60, 60);
    const d = x.getImageData(0, 0, 60, 60).data; let s = 0;
    for (let j = 0; j < d.length; j += 4) s += d[j] + d[j + 1] + d[j + 2];
    return s / (d.length / 4 * 3);
  });
  if (bright > 22) { ok = true; break; }
}
await sleep(300);
await page.screenshot({ path: out });
console.log(`${ok ? "OK" : "DARK?"} ${drill}/${cam}@${phase} -> ${out}`);
await browser.close();
