// MIXAMO ANIMATION SUPPORT for the 3D coach.
//
// human.glb is a Ready Player Me avatar, whose skeleton uses the same bone
// names as Mixamo (Hips, Spine, LeftUpLeg, LeftLeg, LeftFoot, ...) once the
// "mixamorig:" prefix is stripped. That means a Mixamo animation clip binds to
// the coach directly through THREE.AnimationMixer — no retargeting math needed.
//
// To make a drill use a real Mixamo animation, download the clip from
// mixamo.com (FBX, "In Place", without skin) and drop it in
// public/animations/<file> using the name in DRILL_CLIPS below. Until that file
// exists, the drill automatically falls back to the procedural IK motion.
// GLB clips (e.g. Ready Player Me's animation library) work too.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export interface DrillClip {
  /** File under public/animations/ (.fbx from Mixamo, or .glb). */
  file: string;
  /** Which foot the ball should sit next to while the clip plays. */
  foot?: "L" | "R";
}

// Drill name (lower-case, matches the DB/motions registry) → Mixamo clip file.
// Suggested Mixamo searches per drill are in public/animations/README.md.
export const DRILL_CLIPS: Record<string, DrillClip> = {
  "power strike form": { file: "power-strike.fbx", foot: "R" },
  "wall pass precision": { file: "wall-pass.fbx", foot: "R" },
  "corver quick touches": { file: "corver-quick-touches.fbx" },
  "toe taps": { file: "toe-taps.fbx" },
  "sole roll dribble": { file: "sole-roll-dribble.fbx" },
  "v-pull turns": { file: "v-pull-turns.fbx" },
  "juggling starter": { file: "juggling.fbx", foot: "R" },
  "knee bounce combo": { file: "knee-bounce.fbx", foot: "R" },
};

export function getDrillClip(name?: string | null): DrillClip | null {
  if (!name) return null;
  return DRILL_CLIPS[name.trim().toLowerCase()] ?? null;
}

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const cache = new Map<string, Promise<THREE.AnimationClip | null>>();

/** Load (and cache) the first animation clip from a GLB or FBX file, sanitised
 *  to bind to the coach's skeleton. Resolves null if the file is missing. */
export function loadClip(url: string): Promise<THREE.AnimationClip | null> {
  let p = cache.get(url);
  if (!p) {
    p = doLoad(url);
    cache.set(url, p);
  }
  return p;
}

async function doLoad(url: string): Promise<THREE.AnimationClip | null> {
  try {
    if (/\.fbx(\?|$)/i.test(url)) {
      const obj = await fbxLoader.loadAsync(url);
      const clip = obj.animations?.[0];
      if (!clip) return null;
      sanitizeMixamoFbx(clip);
      return clip;
    }
    const gltf = await gltfLoader.loadAsync(url);
    const clip = gltf.animations?.[0];
    if (!clip) return null;
    for (const tr of clip.tracks) tr.name = stripPrefix(tr.name);
    return clip;
  } catch {
    // Missing file / decode error → caller falls back to IK motion.
    return null;
  }
}

const stripPrefix = (name: string) => name.replace(/^mixamorig[:_]?/i, "");

// Mixamo FBX clips reference "mixamorig:Bone" tracks and carry centimetre-scale
// root translation. Strip the prefix so tracks match the avatar, drop the
// per-bone translation (keep the coach in place + centred), and convert the
// Hips translation from cm to m so any vertical motion stays sensible.
function sanitizeMixamoFbx(clip: THREE.AnimationClip): void {
  for (const tr of clip.tracks) tr.name = stripPrefix(tr.name);
  clip.tracks = clip.tracks.filter(
    (tr) => !/\.position$/.test(tr.name) || /^Hips\.position$/.test(tr.name),
  );
  for (const tr of clip.tracks) {
    if (/^Hips\.position$/.test(tr.name)) {
      const v = tr.values as Float32Array | number[];
      for (let i = 0; i < v.length; i++) v[i] *= 0.01;
    }
  }
}
