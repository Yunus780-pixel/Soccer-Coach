// Bridges the tested 2D ROBO-COACH skeleton into the 3D world.
//
// The choreography in motions.ts and the IK in engine.ts are deliberately
// reused untouched (they're physics-checked by motions.test.ts). Here we only
// translate one solved skeleton frame — SVG coords, y growing DOWN — into 3D
// world points (y UP, ground at y=0) and give the otherwise-flat rig real
// volume by pushing the left side of the body to -z and the right side to +z.

import { GROUND_Y, STAGE, type RobotSkeleton, type Vec } from "./engine";

export type V3 = [number, number, number];

/** SVG px -> world units. The whole stage (400px) becomes 8 world units. */
export const WORLD_SCALE = 0.02;
/** Stage horizontal centre — maps to world x = 0. */
const CENTER_X = STAGE.w / 2;
/** Depth pushed to each side of the body so the planar rig reads as 3D. */
export const LIMB_DEPTH = 0.34;

/** Map an SVG point to a 3D world point at depth `z`. SVG y is down → world up. */
export function to3d(p: Vec, z = 0): V3 {
  return [(p.x - CENTER_X) * WORLD_SCALE, (GROUND_Y - p.y) * WORLD_SCALE, z];
}

/** Every named joint a bone or socket can hang off of. */
export type PointName =
  | "hipL" | "hipR" | "kneeL" | "kneeR" | "footL" | "footR"
  | "shoulderL" | "shoulderR" | "elbowL" | "elbowR" | "handL" | "handR"
  | "pelvis" | "neck" | "head";

export type RigPoints = Record<PointName, V3> & {
  /** Ball centre in world space (its z follows the acting foot in side view). */
  ball: V3;
  ballHidden: boolean;
  /** Contact point for the strike flash, or null between contacts. */
  flash: V3 | null;
  /** Base of the rebound wall (wall-pass drill), or null. */
  wall: V3 | null;
  /** The foot the demo is highlighting — drives the foot motion trail. */
  activeFoot: V3;
};

/** Turn one solved 2D skeleton frame into all the 3D points the rig needs. */
export function rigPoints(skel: RobotSkeleton, view: "front" | "side"): RigPoints {
  const zL = -LIMB_DEPTH;
  const zR = LIMB_DEPTH;
  // In side view the ball sits in front on the near (right/kicking) side so the
  // strike reads correctly even as the camera orbits; in front view it's centred.
  const ballZ = view === "side" ? zR : 0;

  const pose = skel.pose;
  const footL = to3d(skel.footL, zL);
  const footR = to3d(skel.footR, zR);
  const active = (pose.watchLeg ?? "R") === "L" ? footL : footR;

  return {
    hipL: to3d(skel.hipL, zL),
    hipR: to3d(skel.hipR, zR),
    kneeL: to3d(skel.kneeL, zL),
    kneeR: to3d(skel.kneeR, zR),
    footL,
    footR,
    shoulderL: to3d(skel.shoulderL, zL),
    shoulderR: to3d(skel.shoulderR, zR),
    elbowL: to3d(skel.elbowL, zL),
    elbowR: to3d(skel.elbowR, zR),
    handL: to3d(skel.handL, zL),
    handR: to3d(skel.handR, zR),
    pelvis: to3d(pose.pelvis, 0),
    neck: to3d(skel.neck, 0),
    head: to3d(skel.head, 0),
    ball: to3d(pose.ball, ballZ),
    ballHidden: !!pose.ball.hidden,
    flash: pose.flash ? to3d(pose.flash, ballZ) : null,
    wall: pose.ball.wall != null ? to3d({ x: pose.ball.wall, y: GROUND_Y }, ballZ) : null,
    activeFoot: active,
  };
}
