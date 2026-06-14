// ROBO-COACH choreographies: one motion program per drill.
//
// RULES every motion must obey (motions.test.ts enforces them):
// 1. Loops perfectly: pose(0) and pose(1) line up (no snapping).
// 2. Feet never sink below GROUND_Y; the ball never sinks below BALL_GROUND_Y.
// 3. Nothing teleports between frames (the ball may jump while hidden/off-screen).
// 4. Foot targets stay reachable (within THIGH + SHIN of the hip).
// 5. The motion must LOOK like the drill it demonstrates.

import {
  type DrillMotion,
  type RobotPose,
  type Vec,
  GROUND_Y,
  BALL_GROUND_Y,
  BALL_R,
  PELVIS_STAND_Y,
  arcY,
  clamp,
  easeIn,
  easeInOut,
  easeOut,
  lerp,
  osc,
  seq,
} from "./engine";

const CENTER = 200;
const BALL_TOP = BALL_GROUND_Y - BALL_R; // ball-top y when ball rests on ground

const mirror = (v: Vec, center = CENTER): Vec => ({ x: 2 * center - v.x, y: v.y });
/** 0→1→0 hump that peaks at the middle (smooth, loops cleanly) */
const hump = (t: number) => Math.sin(clamp(t, 0, 1) * Math.PI);
/** 1→0→1 dip that bottoms at the middle and is 1 at both ends */
const endsHigh = (p: number) => (Math.cos(p * Math.PI * 2) + 1) / 2;

// ════════════════════════════════════════════════════════════════════
// 1. CORVER QUICK TOUCHES (corver, front) — fast inside-foot taps,
//    ball jitters left-right between the feet. Quick and bouncy.
// ════════════════════════════════════════════════════════════════════
const corverQuickTouches: DrillMotion = {
  id: "corver-quick-touches",
  view: "front",
  duration: 0.82,
  idealKnee: [110, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    // Ball crosses the middle twice per loop (one touch per foot)
    const ball: Vec = { x: CENTER + 12 * Math.sin(p * Math.PI * 2), y: BALL_GROUND_Y };
    const rightActive = p < 0.5;
    const localT = rightActive ? p / 0.5 : (p - 0.5) / 0.5;
    const poke = hump(localT); // 0→1→0 inside poke

    // Active foot pokes inward toward the ball; the other stays planted
    const restR: Vec = { x: CENTER + 22, y: GROUND_Y };
    const contactR: Vec = { x: CENTER + 6, y: GROUND_Y - 6 };
    const footR = rightActive
      ? { x: lerp(restR.x, contactR.x, poke), y: lerp(restR.y, contactR.y, poke) }
      : restR;
    const footL = !rightActive
      ? mirror({ x: lerp(restR.x, contactR.x, poke), y: lerp(restR.y, contactR.y, poke) })
      : mirror(restR);

    const touching = poke > 0.78;
    return {
      pelvis: { x: CENTER, y: PELVIS_STAND_Y + 3 + osc(p, 2, 2, 0, 0.25) },
      torsoLean: 0,
      footL,
      footR,
      kneeBendL: 1,
      kneeBendR: -1,
      ball: { ...ball, spin: 0 },
      watchLeg: rightActive ? "R" : "L",
      flash: touching ? { x: ball.x, y: BALL_TOP } : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 2. V-PULL TURNS (corver, side) — sole drags the ball back, then the
//    inside of the foot pushes it forward at an angle: a "V" shape.
// ════════════════════════════════════════════════════════════════════
const vPullBall = seq([
  { at: 0.0, v: { x: 236, y: BALL_GROUND_Y } }, // out front
  { at: 0.35, v: { x: 176, y: BALL_GROUND_Y }, ease: easeIn }, // dragged back
  { at: 0.55, v: { x: 182, y: BALL_GROUND_Y }, ease: easeOut }, // pause
  { at: 1.0, v: { x: 236, y: BALL_GROUND_Y }, ease: easeInOut }, // pushed back out
]);
const vPullFoot = seq([
  { at: 0.0, v: { x: 236, y: BALL_TOP } }, // sole on ball, forward
  { at: 0.35, v: { x: 176, y: BALL_TOP }, ease: easeIn }, // drags ball back
  { at: 0.5, v: { x: 174, y: GROUND_Y - 26 }, ease: easeOut }, // lifts off
  { at: 0.72, v: { x: 205, y: GROUND_Y }, ease: easeInOut }, // plants down
  { at: 1.0, v: { x: 236, y: BALL_TOP }, ease: easeInOut }, // back onto ball
]);
const vPullTurns: DrillMotion = {
  id: "v-pull-turns",
  view: "side",
  duration: 1.7,
  idealKnee: [110, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    const ball = vPullBall(p);
    const footR = vPullFoot(p);
    const contact = footR.y > BALL_TOP - 4 && Math.abs(footR.x - ball.x) < 14;
    return {
      pelvis: { x: 182, y: PELVIS_STAND_Y + 4 + osc(p, 1, 2) },
      torsoLean: 8,
      footL: { x: 176, y: GROUND_Y }, // planted standing foot
      footR,
      kneeBendL: -1,
      kneeBendR: -1,
      ball: { ...ball },
      watchLeg: "R",
      flash: contact ? { x: ball.x, y: BALL_TOP } : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 3. TOE TAPS (dribbling, front) — tap the TOP of the ball with
//    alternating feet, bouncing lightly on the standing leg.
// ════════════════════════════════════════════════════════════════════
const TT_TOP = BALL_TOP - 2;
const toeTapFoot = seq([
  { at: 0.0, v: { x: CENTER + 17, y: GROUND_Y } },
  { at: 0.1, v: { x: CENTER + 10, y: TT_TOP - 6 }, ease: easeOut },
  { at: 0.22, v: { x: CENTER + 3, y: TT_TOP }, ease: easeIn },
  { at: 0.4, v: { x: CENTER + 17, y: GROUND_Y }, ease: easeOut },
]);
const toeTaps: DrillMotion = {
  id: "toe-taps",
  view: "front",
  duration: 1.15,
  idealKnee: [110, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    const footR = toeTapFoot(p);
    const footL = mirror(toeTapFoot(p + 0.5));
    const tapping: "L" | "R" = p < 0.5 ? "R" : "L";
    const tapPhase = p < 0.5 ? p : p - 0.5;
    const touching = Math.abs(tapPhase - 0.22) < 0.045;
    return {
      pelvis: { x: CENTER, y: PELVIS_STAND_Y + 3 + osc(p, 2, 2.4, 0, 0.25) },
      torsoLean: 0,
      footL,
      footR,
      kneeBendL: 1,
      kneeBendR: -1,
      ball: { x: CENTER, y: BALL_GROUND_Y, spin: 0 },
      watchLeg: tapping,
      flash: touching ? { x: CENTER, y: TT_TOP } : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 4. SOLE ROLL DRIBBLE (dribbling, front) — roll the ball side to side
//    under the sole, body shuffling along with it. Feet hand off at the
//    edges (right foot rolls it left, left foot rolls it back).
// ════════════════════════════════════════════════════════════════════
const SR_TOP = BALL_TOP;
// Right foot over a full loop: on the ball [0..0.5], stepping back [0.5..1]
const srRightFoot = seq([
  { at: 0.0, v: { x: 238, y: SR_TOP } },
  { at: 0.25, v: { x: 200, y: SR_TOP }, ease: easeInOut },
  { at: 0.5, v: { x: 164, y: SR_TOP }, ease: easeInOut }, // hands ball to left foot
  { at: 0.62, v: { x: 172, y: GROUND_Y - 4 }, ease: easeOut }, // lifts, steps back
  { at: 0.82, v: { x: 214, y: GROUND_Y }, ease: easeInOut },
  { at: 1.0, v: { x: 238, y: SR_TOP }, ease: easeInOut }, // back onto ball
]);
const soleRollDribble: DrillMotion = {
  id: "sole-roll-dribble",
  view: "front",
  duration: 1.9,
  idealKnee: [110, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    const footR = srRightFoot(p);
    const footL = mirror(srRightFoot(p + 0.5));
    // Ball rides under whichever sole is on it: 240 → 160 → 240
    const ball: Vec = { x: CENTER + 40 * Math.cos(p * Math.PI * 2), y: BALL_GROUND_Y };
    return {
      pelvis: { x: CENTER + 22 * Math.cos(p * Math.PI * 2), y: PELVIS_STAND_Y + 4 },
      torsoLean: 0,
      footL,
      footR,
      kneeBendL: 1,
      kneeBendR: -1,
      ball: { ...ball, spin: -ball.x / BALL_R },
      watchLeg: p < 0.5 ? "R" : "L",
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 5. JUGGLING STARTER (juggling, side) — kick the ball up off the
//    instep to head height, let it fall, kick again. Locked ankle.
// ════════════════════════════════════════════════════════════════════
const JG_CONTACT_Y = GROUND_Y - 44;
const JG_APEX_Y = 116;
const jugglingStarter: DrillMotion = {
  id: "juggling-starter",
  view: "side",
  duration: 1.1,
  idealKnee: [100, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    // Ball: up-and-down arc, contacting the foot at p=0 (=1)
    const ballY = arcY(p, JG_CONTACT_Y, JG_CONTACT_Y, JG_CONTACT_Y - JG_APEX_Y);
    const ball: Vec = { x: 214 + 4 * Math.sin(p * Math.PI * 2), y: ballY };
    // Right foot lifts to strike near the start/end of the loop
    const lift = endsHigh(p); // 1 at strike, 0 mid-air
    const footR: Vec = {
      x: 210 + 10 * lift,
      y: GROUND_Y - 50 * lift,
    };
    const touching = lift > 0.82;
    return {
      pelvis: { x: 184, y: PELVIS_STAND_Y + 3 - 4 * lift },
      torsoLean: 6,
      footL: { x: 178, y: GROUND_Y }, // hop/standing leg
      footR,
      kneeBendL: -1,
      kneeBendR: -1,
      ball,
      watchLeg: "R",
      flash: touching ? { x: ball.x, y: Math.max(ball.y, JG_CONTACT_Y - 6) } : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 6. KNEE BOUNCE COMBO (juggling, side) — alternate a foot bounce and a
//    higher knee (thigh) bounce. Two contacts per loop.
// ════════════════════════════════════════════════════════════════════
const KB_FOOT_CONTACT_Y = GROUND_Y - 42;
const KB_KNEE_CONTACT_Y = GROUND_Y - 92;
const kneeBounceCombo: DrillMotion = {
  id: "knee-bounce-combo",
  view: "side",
  duration: 1.7,
  idealKnee: [100, 150],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    // Two bounces: foot bounce (contact at p=0/1), knee bounce (contact at p=0.5)
    let ball: Vec;
    if (p < 0.5) {
      // off the foot (low) up to a mid apex, coming down to the knee
      const t = p / 0.5;
      ball = {
        x: lerp(212, 206, t),
        y: arcY(t, KB_FOOT_CONTACT_Y, KB_KNEE_CONTACT_Y, 70),
      };
    } else {
      const t = (p - 0.5) / 0.5;
      ball = {
        x: lerp(206, 212, t),
        y: arcY(t, KB_KNEE_CONTACT_Y, KB_FOOT_CONTACT_Y, 96),
      };
    }
    const footBounce = endsHigh(p); // 1 at foot contact (p=0/1)
    const kneeLift = hump(p); // smooth single hump peaking mid-loop (knee bounce)
    // Foot target: low lift for foot bounce, tucked HIGH for knee bounce
    const footR: Vec = {
      x: 208 + 8 * footBounce + 14 * kneeLift,
      y: GROUND_Y - 46 * footBounce - 78 * kneeLift,
    };
    const footContact = footBounce > 0.84;
    const kneeContact = kneeLift > 0.84;
    return {
      pelvis: { x: 184, y: PELVIS_STAND_Y + 3 - 5 * kneeLift },
      torsoLean: 7,
      footL: { x: 178, y: GROUND_Y },
      footR,
      kneeBendL: -1,
      kneeBendR: -1,
      ball,
      watchLeg: "R",
      flash:
        footContact || kneeContact
          ? { x: ball.x, y: ball.y }
          : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 7. POWER STRIKE FORM (shooting, side) — plant beside the ball, swing
//    the leg through, strike with the laces, follow through high. Ball
//    rockets off forward, then a fresh ball is set down to repeat.
// ════════════════════════════════════════════════════════════════════
const PS_REST: Vec = { x: 226, y: BALL_GROUND_Y };
const powerStrikeForm: DrillMotion = {
  id: "power-strike-form",
  view: "side",
  duration: 2.0,
  idealKnee: [110, 160],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);

    // Kicking-foot path: windup back → strike forward → follow through high → reset
    const footR = seq([
      { at: 0.0, v: { x: 198, y: GROUND_Y } }, // ready
      { at: 0.32, v: { x: 158, y: GROUND_Y - 30 }, ease: easeInOut }, // windup back & up
      { at: 0.46, v: { x: 226, y: GROUND_Y - 6 }, ease: easeIn }, // STRIKE through ball
      { at: 0.6, v: { x: 256, y: GROUND_Y - 60 }, ease: easeOut }, // follow through high
      { at: 0.8, v: { x: 214, y: GROUND_Y }, ease: easeInOut }, // come down
      { at: 1.0, v: { x: 198, y: GROUND_Y }, ease: easeInOut }, // back to ready
    ])(p);

    // Ball: rests until the strike (~0.46), then flies up-forward off screen,
    // hides, and a fresh ball is placed at rest before the loop repeats.
    let ball: RobotPose["ball"];
    if (p < 0.46) {
      ball = { ...PS_REST };
    } else if (p < 0.74) {
      const t = (p - 0.46) / 0.28;
      ball = {
        x: lerp(PS_REST.x, 470, easeOut(t)),
        y: arcY(t, PS_REST.y, 150, 120),
        spin: t * 30,
      };
    } else {
      // off-screen: hidden, then a new ball appears at rest for the next loop
      ball = p < 0.93 ? { ...PS_REST, hidden: true } : { ...PS_REST };
    }

    const striking = p > 0.42 && p < 0.5;
    return {
      pelvis: { x: 176, y: PELVIS_STAND_Y + 2 + osc(p, 1, 2) },
      torsoLean: 12,
      footL: { x: 188, y: GROUND_Y }, // planted support foot beside the ball
      footR,
      kneeBendL: -1,
      kneeBendR: -1,
      ball,
      watchLeg: "R",
      flash: striking ? { x: PS_REST.x, y: BALL_TOP } : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// 8. WALL PASS PRECISION (passing, side) — push-pass the ball forward
//    with the inside of the foot, it rebounds off the wall, control it
//    with one touch, repeat. Locked ankle, firm standing leg.
// ════════════════════════════════════════════════════════════════════
const WALL_X = 366;
const WP_REST_X = 214;
const wallPassPrecision: DrillMotion = {
  id: "wall-pass-precision",
  view: "side",
  duration: 2.1,
  idealKnee: [125, 165],
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);

    // Ball: pushed out to the wall, rebounds back, gets controlled, repeats
    const ball = seq([
      { at: 0.0, v: { x: WP_REST_X, y: BALL_GROUND_Y } },
      { at: 0.12, v: { x: WP_REST_X, y: BALL_GROUND_Y } }, // sitting, about to be passed
      { at: 0.34, v: { x: WALL_X, y: BALL_GROUND_Y }, ease: easeOut }, // out to wall
      { at: 0.58, v: { x: WP_REST_X + 8, y: BALL_GROUND_Y }, ease: easeIn }, // rebound back
      { at: 0.72, v: { x: WP_REST_X, y: BALL_GROUND_Y }, ease: easeOut }, // controlled
      { at: 1.0, v: { x: WP_REST_X, y: BALL_GROUND_Y }, ease: easeInOut },
    ])(p);

    // Passing foot: short inside-foot jab at the pass (~0.12-0.2), then a
    // small control touch when the ball returns (~0.58-0.7)
    const footR = seq([
      { at: 0.0, v: { x: 196, y: GROUND_Y } },
      { at: 0.12, v: { x: 188, y: GROUND_Y - 4 }, ease: easeOut }, // load
      { at: 0.2, v: { x: 212, y: GROUND_Y - 4 }, ease: easeIn }, // jab through ball
      { at: 0.34, v: { x: 198, y: GROUND_Y }, ease: easeInOut }, // recover
      { at: 0.6, v: { x: 206, y: GROUND_Y - 5 }, ease: easeOut }, // reach for return
      { at: 0.72, v: { x: 200, y: GROUND_Y }, ease: easeInOut }, // cushion control
      { at: 1.0, v: { x: 196, y: GROUND_Y }, ease: easeInOut },
    ])(p);

    const passing = p > 0.14 && p < 0.22;
    const hitsWall = p > 0.32 && p < 0.37;
    return {
      pelvis: { x: 178, y: PELVIS_STAND_Y + 3 + osc(p, 1, 1.5) },
      torsoLean: 8,
      footL: { x: 172, y: GROUND_Y }, // firm standing leg
      footR,
      kneeBendL: -1,
      kneeBendR: -1,
      ball: { ...ball, wall: WALL_X } as RobotPose["ball"],
      watchLeg: "R",
      flash: passing
        ? { x: WP_REST_X + 6, y: BALL_TOP }
        : hitsWall
        ? { x: WALL_X, y: BALL_TOP }
        : undefined,
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// Fallback idle: gentle bounce next to the ball
// ════════════════════════════════════════════════════════════════════
const idle: DrillMotion = {
  id: "idle",
  view: "front",
  duration: 2.4,
  pose: (phase): RobotPose => {
    const p = phase - Math.floor(phase);
    const bob = osc(p, 1, 2.5);
    return {
      pelvis: { x: 186, y: PELVIS_STAND_Y + 2 + bob },
      torsoLean: osc(p, 1, 1.5),
      footL: { x: 186 - 17, y: GROUND_Y },
      footR: { x: 186 + 17, y: GROUND_Y },
      kneeBendL: 1,
      kneeBendR: -1,
      ball: { x: 252, y: BALL_GROUND_Y, spin: 0 },
      watchLeg: "R",
    };
  },
};

// ════════════════════════════════════════════════════════════════════
// Registry: exact drill names first, then category fallbacks
// ════════════════════════════════════════════════════════════════════
const MOTIONS_BY_DRILL_NAME: Record<string, DrillMotion> = {
  "corver quick touches": corverQuickTouches,
  "v-pull turns": vPullTurns,
  "toe taps": toeTaps,
  "sole roll dribble": soleRollDribble,
  "juggling starter": jugglingStarter,
  "knee bounce combo": kneeBounceCombo,
  "power strike form": powerStrikeForm,
  "wall pass precision": wallPassPrecision,
};

const MOTIONS_BY_CATEGORY: Record<string, DrillMotion> = {
  corver: corverQuickTouches,
  dribbling: toeTaps,
  juggling: jugglingStarter,
  shooting: powerStrikeForm,
  passing: wallPassPrecision,
};

export function getMotionForDrill(
  drillName?: string | null,
  category?: string | null,
): DrillMotion {
  const byName = drillName
    ? MOTIONS_BY_DRILL_NAME[drillName.trim().toLowerCase()]
    : undefined;
  if (byName) return byName;
  const byCategory = category
    ? MOTIONS_BY_CATEGORY[category.trim().toLowerCase()]
    : undefined;
  return byCategory ?? idle;
}

/** Every motion, for the tests to check one by one */
export const ALL_MOTIONS: DrillMotion[] = [
  corverQuickTouches,
  vPullTurns,
  toeTaps,
  soleRollDribble,
  jugglingStarter,
  kneeBounceCombo,
  powerStrikeForm,
  wallPassPrecision,
  idle,
];
