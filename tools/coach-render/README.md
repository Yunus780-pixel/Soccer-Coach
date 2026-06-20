# Coach video renderer (offline)

Renders the 3D coach doing each drill, from **Front / Side / Back**, into small
looping **H.264 MP4s** that the app plays. Pre-rendered video plays instantly on
any device (incl. iPhone/Safari) with no WebGL — so the coach demo is reliable
even where the live 3D scene can't run. The live 3D coach is still available in
the app behind the **3D** toggle (real-time / interactive).

This tool is **offline-only**: it is not part of the app build and not in the
pnpm workspace. Its `node_modules` is git-ignored. The rendered `.mp4` files
(committed under `artifacts/soccer-trainer/public/videos/`) are what ship.

## How it works

1. Opens the dev server's `/__preview?drill=…&cam=front|side|back&record=1` in
   headless Chrome (via `puppeteer-core` + your installed Google Chrome).
2. Steps the animation `window.__coachPhase` from 0→1, capturing one exact
   frame per step with `canvas.toDataURL`. Because frames are sampled by phase
   (not wall-clock), the loop is perfectly seamless.
3. Encodes the frames with `ffmpeg` (`ffmpeg-static`, no system install needed)
   to a faststart MP4 with `yuv420p` (required for Safari/QuickTime).

## Usage

The web dev server must be running on `http://localhost:3000` (the repo's
`start-app.sh`, or `pnpm --filter @workspace/soccer-trainer dev`).

```bash
cd tools/coach-render
npm install                 # first time only (puppeteer-core + ffmpeg-static)

node render.mjs             # all configured drills, all angles
node render.mjs toe-taps    # one drill, all angles
node render.mjs toe-taps front

node verify.mjs toe-taps-front   # sanity-check a clip (plays it, saves frames)
```

Env overrides: `BASE_URL`, `OUT_DIR`, `WIDTH`, `HEIGHT`, `FPS`, `CHROME_PATH`.

## Scaling to more drills

1. Add the drill to `ALL_DRILLS` in `render.mjs` (`{ name, slug }` — `name` must
   match the DB / `motions.ts` registry; `slug` is the file name).
2. Add the same `slug` to `VIDEO_DRILLS` in
   `artifacts/soccer-trainer/src/components/robot-coach/coach-demo.tsx` so the
   app serves the video instead of falling back to the live 3D coach.
3. `node render.mjs <slug>` and commit the new `*.mp4` files.
