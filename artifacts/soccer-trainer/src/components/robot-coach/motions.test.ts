// Physics referees for the ROBO-COACH: every choreography must obey
// the laws of (cartoon) physics. New motions are checked automatically.
import { describe, it, expect } from "vitest";
import {
  buildSkeleton,
  GROUND_Y,
  BALL_GROUND_Y,
  STAGE,
  THIGH,
  SHIN,
  HIP_OFFSET_FRONT,
  HIP_OFFSET_SIDE,
  type DrillMotion,
  type Vec,
} from "./engine";
import { ALL_MOTIONS, getMotionForDrill } from "./motions";

const SAMPLES = 240;
const FLOOR_TOLERANCE = 0.8; // px of grace below the ground line
const LOOP_TOLERANCE = 6; // px allowed between pose(0) and pose(1)
const MAX_BODY_SPEED = 2200; // px/sec — fast kicks allowed, teleports not
const MAX_BALL_SPEED = 3400; // px/sec — struck balls fly fast

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const offScreen = (v: Vec) => v.x < -40 || v.x > STAGE.w + 40 || v.y < -40;

function sample(motion: DrillMotion, phase: number) {
  const pose = motion.pose(phase);
  const skel = buildSkeleton(pose, motion.view);
  return { pose, skel };
}

describe.each(ALL_MOTIONS.map((m) => [m.id, m] as const))(
  "motion %s",
  (_id, motion) => {
    const frames = Array.from({ length: SAMPLES + 1 }, (_, i) =>
      sample(motion, i / SAMPLES),
    );
    const dtSec = motion.duration / SAMPLES;

    it("never produces NaN bones", () => {
      for (const { skel } of frames) {
        for (const part of [
          skel.kneeL, skel.kneeR, skel.footL, skel.footR,
          skel.head, skel.handL, skel.handR,
        ]) {
          expect(Number.isFinite(part.x)).toBe(true);
          expect(Number.isFinite(part.y)).toBe(true);
        }
      }
    });

    it("feet never sink below the ground", () => {
      for (const { skel } of frames) {
        expect(skel.footL.y).toBeLessThanOrEqual(GROUND_Y + FLOOR_TOLERANCE);
        expect(skel.footR.y).toBeLessThanOrEqual(GROUND_Y + FLOOR_TOLERANCE);
      }
    });

    it("the ball never sinks below the ground", () => {
      for (const { pose } of frames) {
        if (pose.ball.hidden) continue;
        expect(pose.ball.y).toBeLessThanOrEqual(BALL_GROUND_Y + FLOOR_TOLERANCE);
      }
    });

    it("nothing teleports between frames", () => {
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        expect(dist(a.skel.footL, b.skel.footL)).toBeLessThanOrEqual(MAX_BODY_SPEED * dtSec);
        expect(dist(a.skel.footR, b.skel.footR)).toBeLessThanOrEqual(MAX_BODY_SPEED * dtSec);
        expect(dist(a.pose.pelvis, b.pose.pelvis)).toBeLessThanOrEqual(MAX_BODY_SPEED * dtSec);

        const ballExempt =
          a.pose.ball.hidden || b.pose.ball.hidden ||
          offScreen(a.pose.ball) || offScreen(b.pose.ball);
        if (!ballExempt) {
          expect(dist(a.pose.ball, b.pose.ball)).toBeLessThanOrEqual(MAX_BALL_SPEED * dtSec);
        }
      }
    });

    it("loops seamlessly: the end flows back into the start", () => {
      const first = frames[0];
      const last = frames[SAMPLES];
      expect(dist(first.skel.footL, last.skel.footL)).toBeLessThanOrEqual(LOOP_TOLERANCE);
      expect(dist(first.skel.footR, last.skel.footR)).toBeLessThanOrEqual(LOOP_TOLERANCE);
      expect(dist(first.pose.pelvis, last.pose.pelvis)).toBeLessThanOrEqual(LOOP_TOLERANCE);
      const ballExempt =
        first.pose.ball.hidden || last.pose.ball.hidden ||
        offScreen(first.pose.ball) || offScreen(last.pose.ball);
      if (!ballExempt) {
        expect(dist(first.pose.ball, last.pose.ball)).toBeLessThanOrEqual(LOOP_TOLERANCE + 2);
      }
    });

    it("foot targets stay reachable (no stiff clamped legs)", () => {
      const hipOff = motion.view === "front" ? HIP_OFFSET_FRONT : HIP_OFFSET_SIDE;
      const maxReach = THIGH + SHIN + 8;
      for (const { pose } of frames) {
        const hipL: Vec = { x: pose.pelvis.x - hipOff, y: pose.pelvis.y };
        const hipR: Vec = { x: pose.pelvis.x + hipOff, y: pose.pelvis.y };
        expect(dist(hipL, pose.footL)).toBeLessThanOrEqual(maxReach);
        expect(dist(hipR, pose.footR)).toBeLessThanOrEqual(maxReach);
      }
    });

    it("knees bend like real knees (no impossible angles)", () => {
      for (const { skel } of frames) {
        for (const angle of [skel.kneeAngleL, skel.kneeAngleR]) {
          expect(angle).toBeGreaterThanOrEqual(25);
          expect(angle).toBeLessThanOrEqual(180);
        }
      }
    });

    it("stays roughly on stage", () => {
      for (const { pose } of frames) {
        expect(pose.pelvis.x).toBeGreaterThanOrEqual(40);
        expect(pose.pelvis.x).toBeLessThanOrEqual(STAGE.w - 40);
        expect(pose.pelvis.y).toBeGreaterThanOrEqual(80);
        expect(pose.pelvis.y).toBeLessThanOrEqual(GROUND_Y - 40);
      }
    });
  },
);

describe("getMotionForDrill", () => {
  it("finds a motion by exact drill name (any capitalization)", () => {
    expect(getMotionForDrill("Toe Taps", "dribbling").id).toBe("toe-taps");
    expect(getMotionForDrill("TOE TAPS", null).id).toBe("toe-taps");
  });

  it("falls back to the category when the name is unknown", () => {
    expect(getMotionForDrill("Brand New Drill", "dribbling").id).toBe("toe-taps");
  });

  it("falls back to idle when nothing matches", () => {
    expect(getMotionForDrill("Mystery", "yoga").id).toBe("idle");
    expect(getMotionForDrill(null, null).id).toBe("idle");
  });
});
