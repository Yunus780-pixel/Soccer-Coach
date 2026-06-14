// ROBO-COACH engine: the robot's skeleton math.
// Pure functions only (no React) so the robot referees can test every bone.
//
// Coordinate system: SVG stage 400 x 300, y grows DOWNWARD.
// The ground is a line near the bottom; the robot stands on it.
// In "side" view the robot faces RIGHT (+x is forward).

export interface Vec {
  x: number;
  y: number;
}

export const STAGE = { w: 400, h: 300 } as const;
export const GROUND_Y = 262;
export const BALL_R = 13;
/** Ball center y when the ball rests on the ground */
export const BALL_GROUND_Y = GROUND_Y - BALL_R;

export const THIGH = 46;
export const SHIN = 46;
/** Pelvis height with a relaxed, slightly bent knee stance */
export const PELVIS_STAND_Y = GROUND_Y - (THIGH + SHIN) + 6;

export const UPPER_ARM = 30;
export const FOREARM = 27;
export const TORSO_LEN = 58; // pelvis -> neck
export const HIP_OFFSET_FRONT = 13; // half hip width, front view
export const HIP_OFFSET_SIDE = 4; // tiny depth offset, side view

/** Knee bend directions for solveKnee (see its docs) */
export const BEND_FORWARD = -1 as const; // side view, facing right
export const BEND_BACKWARD = 1 as const;

// ----------------------------------------------------------------------
// Easing — how motion speeds up and slows down (nothing real moves linearly)
// ----------------------------------------------------------------------
export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeIn: Ease = (t) => t * t;
export const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
/** smoothstep: gentle start and stop */
export const easeInOut: Ease = (t) => t * t * (3 - 2 * t);

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const vlerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** Sine wobble helper: oscillates around `center` */
export function osc(
  phase: number,
  cycles: number,
  amp: number,
  center = 0,
  offset = 0,
): number {
  return center + amp * Math.sin((phase * cycles + offset) * Math.PI * 2);
}

// ----------------------------------------------------------------------
// Keyframe sequencer: describe WHERE something is at key moments,
// the engine fills in the smooth in-between (and loops back to the start).
// ----------------------------------------------------------------------
export interface Key {
  at: number; // 0..1 phase
  v: Vec;
  ease?: Ease;
}

export function seq(keys: Key[]): (phase: number) => Vec {
  if (keys.length === 0) throw new Error("seq needs at least one key");
  const sorted = [...keys].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  // Wrap: after the last key the value eases back to the first key at phase 1
  const wrapped = [...sorted, { at: 1 + first.at, v: first.v, ease: first.ease }];
  return (phase: number): Vec => {
    let p = phase - Math.floor(phase); // wrap into [0,1)
    if (p < first.at) p += 1; // before the first key = still easing toward it
    for (let i = 0; i < wrapped.length - 1; i++) {
      const a = wrapped[i];
      const b = wrapped[i + 1];
      if (p >= a.at && p <= b.at) {
        const span = b.at - a.at;
        const t = span <= 0 ? 0 : (p - a.at) / span;
        const e = (b.ease ?? easeInOut)(clamp(t, 0, 1));
        return vlerp(a.v, b.v, e);
      }
    }
    return { ...first.v };
  };
}

/** Parabolic flight: a ball arc from y0 to y1 with extra lift at the top */
export function arcY(t: number, y0: number, y1: number, lift: number): number {
  // y is DOWN, so "lift" subtracts
  return lerp(y0, y1, t) - lift * 4 * t * (1 - t);
}

// ----------------------------------------------------------------------
// Two-bone inverse kinematics: given the hip and where the foot should be,
// find where the knee goes. This is what makes legs look ALIVE.
// ----------------------------------------------------------------------
export function solveKnee(
  hip: Vec,
  foot: Vec,
  bend: 1 | -1,
  l1: number = THIGH,
  l2: number = SHIN,
): Vec {
  let dx = foot.x - hip.x;
  let dy = foot.y - hip.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5; // never lock the knee completely straight
  const minD = Math.abs(l1 - l2) + 0.5;
  if (d < 1e-6) {
    dx = 0;
    dy = minD;
    d = minD;
  }
  const target = clamp(d, minD, maxD);
  if (target !== d) {
    dx *= target / d;
    dy *= target / d;
    d = target;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const px = hip.x + (a * dx) / d;
  const py = hip.y + (a * dy) / d;
  return {
    x: px - (bend * (h * dy)) / d,
    y: py + (bend * (h * dx)) / d,
  };
}

/** The actual foot position the knee solver will reach (after clamping) */
export function reachableFoot(
  hip: Vec,
  foot: Vec,
  l1: number = THIGH,
  l2: number = SHIN,
): Vec {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5;
  const minD = Math.abs(l1 - l2) + 0.5;
  if (d < 1e-6) return { x: hip.x, y: hip.y + minD };
  const target = clamp(d, minD, maxD);
  return { x: hip.x + (dx * target) / d, y: hip.y + (dy * target) / d };
}

/** Angle (degrees) at the knee between thigh and shin — same math the camera uses */
export function kneeAngle(hip: Vec, knee: Vec, foot: Vec): number {
  const angle =
    Math.atan2(foot.y - knee.y, foot.x - knee.x) -
    Math.atan2(hip.y - knee.y, hip.x - knee.x);
  let deg = Math.abs((angle * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

// ----------------------------------------------------------------------
// What a drill choreography must produce for every moment in time
// ----------------------------------------------------------------------
export interface BallState {
  x: number;
  y: number;
  /** Extra rotation in radians; if omitted the ball rolls with its x travel */
  spin?: number;
  /** Ball is off doing something else (e.g. flying off-screen) */
  hidden?: boolean;
  /** x of a training wall to draw (wall-pass drill) */
  wall?: number;
}

export interface RobotPose {
  /** Pelvis center */
  pelvis: Vec;
  /** Torso lean in degrees; + leans toward +x (forward in side view) */
  torsoLean: number;
  /** Ankle positions — the engine solves the knees */
  footL: Vec;
  footR: Vec;
  kneeBendL: 1 | -1;
  kneeBendR: 1 | -1;
  ball: BallState;
  /** Optional hand targets; if omitted arms swing automatically */
  handL?: Vec;
  handR?: Vec;
  /** Which leg the knee-angle meter should watch */
  watchLeg?: "L" | "R";
  /** A green contact flash at this point (kick/touch moments) */
  flash?: Vec;
}

export interface DrillMotion {
  id: string;
  view: "front" | "side";
  /** Seconds for one full loop */
  duration: number;
  /** The knee range the AI scores as "excellent" for this drill's category */
  idealKnee?: [number, number];
  pose: (phase: number) => RobotPose;
}

// ----------------------------------------------------------------------
// Full skeleton: everything the renderer (and the tests) need
// ----------------------------------------------------------------------
export interface RobotSkeleton {
  pose: RobotPose;
  hipL: Vec;
  hipR: Vec;
  kneeL: Vec;
  kneeR: Vec;
  footL: Vec;
  footR: Vec;
  neck: Vec;
  head: Vec;
  shoulderL: Vec;
  shoulderR: Vec;
  elbowL: Vec;
  elbowR: Vec;
  handL: Vec;
  handR: Vec;
  kneeAngleL: number;
  kneeAngleR: number;
}

export function buildSkeleton(pose: RobotPose, view: "front" | "side"): RobotSkeleton {
  const hipOff = view === "front" ? HIP_OFFSET_FRONT : HIP_OFFSET_SIDE;
  const hipL: Vec = { x: pose.pelvis.x - hipOff, y: pose.pelvis.y };
  const hipR: Vec = { x: pose.pelvis.x + hipOff, y: pose.pelvis.y };

  const footL = reachableFoot(hipL, pose.footL);
  const footR = reachableFoot(hipR, pose.footR);
  const kneeL = solveKnee(hipL, footL, pose.kneeBendL);
  const kneeR = solveKnee(hipR, footR, pose.kneeBendR);

  const leanRad = (pose.torsoLean * Math.PI) / 180;
  const neck: Vec = {
    x: pose.pelvis.x + Math.sin(leanRad) * TORSO_LEN,
    y: pose.pelvis.y - Math.cos(leanRad) * TORSO_LEN,
  };
  const head: Vec = {
    x: pose.pelvis.x + Math.sin(leanRad) * (TORSO_LEN + 22),
    y: pose.pelvis.y - Math.cos(leanRad) * (TORSO_LEN + 22),
  };

  const shoulderOff = view === "front" ? 19 : 6;
  const shoulderL: Vec = { x: neck.x - shoulderOff, y: neck.y + 6 };
  const shoulderR: Vec = { x: neck.x + shoulderOff, y: neck.y + 6 };

  // Arms: follow given hand targets, or counter-swing against the legs
  const swingL = pose.handL ?? autoHand(shoulderL, footR, footL, view, -1);
  const swingR = pose.handR ?? autoHand(shoulderR, footL, footR, view, 1);
  const handL = clampReach(shoulderL, swingL, UPPER_ARM + FOREARM - 0.5);
  const handR = clampReach(shoulderR, swingR, UPPER_ARM + FOREARM - 0.5);
  const elbowL = solveKnee(shoulderL, handL, 1, UPPER_ARM, FOREARM);
  const elbowR = solveKnee(shoulderR, handR, -1, UPPER_ARM, FOREARM);

  return {
    pose,
    hipL,
    hipR,
    kneeL,
    kneeR,
    footL,
    footR,
    neck,
    head,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    handL,
    handR,
    kneeAngleL: kneeAngle(hipL, kneeL, footL),
    kneeAngleR: kneeAngle(hipR, kneeR, footR),
  };
}

function autoHand(
  shoulder: Vec,
  oppositeFoot: Vec,
  sameFoot: Vec,
  view: "front" | "side",
  side: 1 | -1,
): Vec {
  if (view === "side") {
    // counter-swing: arm goes forward when the opposite foot goes forward
    const swing = clamp((oppositeFoot.x - sameFoot.x) * 0.35, -22, 22);
    return { x: shoulder.x + 6 + swing, y: shoulder.y + UPPER_ARM + FOREARM - 14 };
  }
  // front view: arms held slightly out for balance, bobbing with the feet
  const lift = clamp((GROUND_Y - Math.min(oppositeFoot.y, sameFoot.y)) * 0.25, 0, 14);
  return {
    x: shoulder.x + side * 26,
    y: shoulder.y + UPPER_ARM + FOREARM - 18 - lift,
  };
}

function clampReach(from: Vec, to: Vec, maxLen: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxLen || d < 1e-6) return to;
  return { x: from.x + (dx * maxLen) / d, y: from.y + (dy * maxLen) / d };
}
