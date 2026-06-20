# Coach animations (Mixamo)

The 3D coach (`human.glb`, a Ready Player Me avatar) can play **real Mixamo
mocap animations** for each drill. Its skeleton uses Mixamo-compatible bone
names, so a Mixamo clip binds straight onto it — no retargeting needed.

When a drill's clip file (below) is present in this folder, the coach plays that
mocap animation. If the file is missing, the drill automatically falls back to
the built-in procedural motion. So adding clips is purely additive.

## How to add a Mixamo animation for a drill

1. Go to **https://www.mixamo.com** and sign in (free Adobe account — required;
   this is why the files can't be downloaded automatically).
2. Search for a matching animation (suggestions below) and select it.
3. Turn **"In Place" ON** (keeps the coach centred), then **Download** with:
   - Format: **FBX Binary (.fbx)**
   - Skin: **Without Skin**
   - Frames per Second: 30, Keyframe Reduction: none
4. Rename the downloaded file to the **exact filename** in the table and drop it
   in this folder (`artifacts/soccer-trainer/public/animations/`).
5. Reload the app — that drill now uses the Mixamo animation.

## Drill → filename (and a Mixamo search that fits)

| Drill                | File to drop here            | Mixamo search           |
|----------------------|------------------------------|-------------------------|
| Power Strike Form    | `power-strike.fbx`           | "Soccer" / "Center Kick"|
| Wall Pass Precision  | `wall-pass.fbx`              | "Soccer Pass"           |
| Corver Quick Touches | `corver-quick-touches.fbx`   | "Soccer Dribble" / "Fast Feet" |
| Toe Taps             | `toe-taps.fbx`               | "Soccer Idle" / "Dribble" |
| Sole Roll Dribble    | `sole-roll-dribble.fbx`      | "Dribble"               |
| V-Pull Turns         | `v-pull-turns.fbx`           | "Dribble" / "Pivot"     |
| Juggling Starter     | `juggling.fbx`               | "Soccer Juggle" / "Juggling" |
| Knee Bounce Combo    | `knee-bounce.fbx`            | "Soccer Juggle"         |

(The mapping lives in `src/components/robot-coach/mixamo.ts` — edit `DRILL_CLIPS`
to change filenames or which foot the ball sits next to.)

## Notes

- **GLB clips work too** (e.g. the Ready Player Me animation library), and need
  no Adobe login — but they don't include the specific soccer drills.
- `_sample-footwork.glb` is a real mocap clip included to prove the pipeline.
  Test it on any drill with `…/train/<id>` is not needed — open the dev preview
  `/__preview?drill=toe%20taps&clip=_sample-footwork.glb` to see the coach play
  a real mocap clip immediately.
- Mixamo's library is generic, so it has only a handful of soccer moves; the
  niche drills won't have an exact match and may need the closest fit.
