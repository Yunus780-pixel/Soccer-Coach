// The 3D mapping must keep the rig standing on the floor and give the body
// real left/right depth — checked across every choreography so a bad motion
// can't quietly push the robot through the ground in 3D either.
import { describe, it, expect } from "vitest";
import { buildSkeleton } from "./engine";
import { ALL_MOTIONS } from "./motions";
import { rigPoints, to3d, LIMB_DEPTH } from "./map3d";

const SAMPLES = 60;

describe("to3d", () => {
  it("puts the ground at world y = 0 and the stage centre at x = 0", () => {
    const [x, y] = to3d({ x: 200, y: 262 }); // CENTER_X, GROUND_Y
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it("maps SVG y-down to world y-up (higher on screen = higher in world)", () => {
    const low = to3d({ x: 200, y: 262 })[1];
    const high = to3d({ x: 200, y: 100 })[1];
    expect(high).toBeGreaterThan(low);
  });
});

describe.each(ALL_MOTIONS.map((m) => [m.id, m] as const))("rig points for %s", (_id, motion) => {
  const frames = Array.from({ length: SAMPLES + 1 }, (_, i) =>
    rigPoints(buildSkeleton(motion.pose(i / SAMPLES), motion.view), motion.view),
  );

  it("keeps every joint at or above the floor", () => {
    for (const P of frames) {
      for (const name of ["footL", "footR", "kneeL", "kneeR", "hipL", "hipR", "head"] as const) {
        expect(P[name][1]).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it("gives the body left/right depth (left side -z, right side +z)", () => {
    for (const P of frames) {
      expect(P.hipL[2]).toBeCloseTo(-LIMB_DEPTH);
      expect(P.hipR[2]).toBeCloseTo(LIMB_DEPTH);
    }
  });

  it("produces only finite coordinates", () => {
    for (const P of frames) {
      for (const name of ["footL", "footR", "head", "ball", "activeFoot"] as const) {
        for (const c of P[name]) expect(Number.isFinite(c)).toBe(true);
      }
    }
  });
});
