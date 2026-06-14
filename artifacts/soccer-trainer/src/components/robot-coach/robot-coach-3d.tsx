// ROBO-COACH in real WebGL 3D: the same physics-checked choreography
// (motions.ts) that drove the 2D robot now drives a volumetric rig built from
// capsule limbs, ball joints and a real 3D football, lit and shadowed, with an
// orbiting camera. Motion trails draw the path the acting foot and the ball
// travel so the SHAPE of each skill (the "V" of a v-pull, the swing of a
// strike) is easy to read.
import { useCallback, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BALL_R, buildSkeleton, type DrillMotion } from "./engine";
import { getMotionForDrill } from "./motions";
import {
  LIMB_DEPTH,
  WORLD_SCALE,
  rigPoints,
  to3d,
  type PointName,
  type RigPoints,
  type V3,
} from "./map3d";

interface RobotCoachProps {
  drillName?: string | null;
  category?: string | null;
  /** Compact mode (picture-in-picture): hides the knee meter */
  compact?: boolean;
  className?: string;
}

const GREEN = "#16a34a";
const GREEN_BRIGHT = "#4ade80";
const EYE = "#7dfca5";
const BODY = "#dbe4ee";
const BG = "#0b1220";
const BALL_WORLD_R = BALL_R * WORLD_SCALE;

// Bones as [from, to, radius, material]. Legs glow green; everything else is
// the robot's light bodywork.
type Mat = "leg" | "body";
const BONES: [PointName, PointName, number, Mat][] = [
  ["hipL", "kneeL", 0.085, "leg"],
  ["kneeL", "footL", 0.075, "leg"],
  ["hipR", "kneeR", 0.085, "leg"],
  ["kneeR", "footR", 0.075, "leg"],
  ["shoulderL", "elbowL", 0.058, "body"],
  ["elbowL", "handL", 0.05, "body"],
  ["shoulderR", "elbowR", 0.058, "body"],
  ["elbowR", "handR", 0.05, "body"],
  ["hipL", "hipR", 0.07, "body"],
  ["shoulderL", "shoulderR", 0.055, "body"],
  ["pelvis", "neck", 0.12, "body"],
  ["neck", "head", 0.05, "body"],
];

const JOINTS: [PointName, number, Mat][] = [
  ["hipL", 0.1, "leg"],
  ["hipR", 0.1, "leg"],
  ["kneeL", 0.092, "leg"],
  ["kneeR", 0.092, "leg"],
  ["shoulderL", 0.082, "body"],
  ["shoulderR", 0.082, "body"],
  ["elbowL", 0.066, "body"],
  ["elbowR", 0.066, "body"],
  ["handL", 0.072, "body"],
  ["handR", 0.072, "body"],
  ["neck", 0.072, "body"],
  ["pelvis", 0.115, "body"],
];

const TRAIL_LEN = 42;
const TRAIL_SAMPLE_DT = 0.04; // seconds between trail samples
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Orient a unit cylinder (height 1 along Y) to span world points a→b. */
function orientBone(mesh: THREE.Mesh, a: V3, b: V3, radius: number, dir: THREE.Vector3) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  dir.set(dx / len, dy / len, dz / len);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, dir);
  mesh.scale.set(radius, len, radius);
}

/** A football skin: white field with a rough scatter of black pentagons. */
function makeBallTexture(): THREE.Texture {
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#0f172a";
  const patches: [number, number, number][] = [
    [0.5, 0.22, 0.1],
    [0.2, 0.5, 0.092],
    [0.8, 0.5, 0.092],
    [0.36, 0.8, 0.082],
    [0.64, 0.8, 0.082],
    [0.5, 0.52, 0.06],
  ];
  for (const [u, v, r] of patches) {
    ctx.beginPath();
    const cx = u * s;
    const cy = v * s;
    const rad = r * s;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** Fading vertex colours: tail dark → head bright. */
function fadeColors(points: V3[], hex: string): THREE.Color[] {
  const base = new THREE.Color(hex);
  const n = points.length;
  return points.map((_, i) => {
    const f = (i + 1) / n;
    return base.clone().multiplyScalar(f * f);
  });
}

function pushSample(buf: V3[], p: V3, jump: number) {
  const last = buf[buf.length - 1];
  if (last) {
    const d = Math.hypot(last[0] - p[0], last[1] - p[1], last[2] - p[2]);
    if (d > jump) buf.length = 0; // ball teleported (off-screen reset): start fresh
  }
  buf.push(p);
  if (buf.length > TRAIL_LEN) buf.shift();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

interface KneeInfo {
  deg: number;
  ok: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// The rig — driven imperatively in useFrame so it never re-renders React.
// ────────────────────────────────────────────────────────────────────────
function RobotRig({
  motion,
  reduced,
  onKnee,
  trailRef,
}: {
  motion: DrillMotion;
  reduced: boolean;
  onKnee: (k: KneeInfo) => void;
  trailRef: React.MutableRefObject<{ foot: V3[]; ball: V3[] }>;
}) {
  const cyl = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 16), []);
  const sph = useMemo(() => new THREE.SphereGeometry(1, 20, 16), []);
  const ballTex = useMemo(() => makeBallTexture(), []);

  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BODY, metalness: 0.5, roughness: 0.35 }),
    [],
  );
  const legMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GREEN,
        emissive: GREEN,
        emissiveIntensity: 0.4,
        metalness: 0.3,
        roughness: 0.45,
      }),
    [],
  );
  const eyeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: EYE, emissive: EYE, emissiveIntensity: 1.8 }),
    [],
  );
  const visorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0b1220", metalness: 0.6, roughness: 0.2 }),
    [],
  );
  const bootMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0f172a", metalness: 0.4, roughness: 0.5 }),
    [],
  );
  const ballMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45, metalness: 0.05 }),
    [ballTex],
  );
  const flashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: GREEN_BRIGHT, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    [],
  );

  const matOf = (m: Mat) => (m === "leg" ? legMat : bodyMat);

  const boneRefs = useRef<(THREE.Mesh | null)[]>([]);
  const jointRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const headRef = useRef<THREE.Group>(null);
  const bootL = useRef<THREE.Mesh>(null);
  const bootR = useRef<THREE.Mesh>(null);
  const ballRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);

  const dir = useMemo(() => new THREE.Vector3(), []);
  const footBuf = useRef<V3[]>([]);
  const ballBuf = useRef<V3[]>([]);
  const sampleAcc = useRef(0);
  const kneeAcc = useRef(0);
  const flashStart = useRef(-1);
  const ballSpin = useRef(0);
  const prevBallX = useRef(0);
  const prevBallHidden = useRef(false);

  // The wall (wall-pass drill) is static — compute it once.
  const wall = useMemo<V3 | null>(() => {
    const b = motion.pose(0).ball;
    return b.wall != null ? to3d({ x: b.wall, y: 262 }, motion.view === "side" ? LIMB_DEPTH : 0) : null;
  }, [motion]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const phase = reduced ? 0.3 : (t / motion.duration) % 1;
    const pose = motion.pose(phase);
    const skel = buildSkeleton(pose, motion.view);
    const P = rigPoints(skel, motion.view);

    for (let i = 0; i < BONES.length; i++) {
      const m = boneRefs.current[i];
      if (m) orientBone(m, P[BONES[i][0]], P[BONES[i][1]], BONES[i][2], dir);
    }
    for (const [name, r] of JOINTS) {
      const m = jointRefs.current[name];
      if (!m) continue;
      const p = P[name];
      m.position.set(p[0], p[1], p[2]);
      m.scale.setScalar(r);
    }

    if (headRef.current) {
      const h = P.head;
      headRef.current.position.set(h[0], h[1], h[2]);
      const yaw = motion.view === "side" ? -Math.PI / 2 : 0;
      headRef.current.rotation.set(0.12, yaw + (pose.torsoLean * Math.PI) / 180 * 0.3, 0);
    }

    setBoot(bootL.current, P.footL, motion.view);
    setBoot(bootR.current, P.footR, motion.view);

    if (ballRef.current) {
      ballRef.current.visible = !P.ballHidden;
      const b = P.ball;
      ballRef.current.position.set(b[0], b[1], b[2]);
      const dx = b[0] - prevBallX.current;
      prevBallX.current = b[0];
      ballSpin.current -= dx / BALL_WORLD_R; // roll with travel
      const extra = pose.ball.spin ?? 0;
      ballRef.current.rotation.set(ballSpin.current * 0.5, ballSpin.current + extra, extra * 0.3);
    }

    if (flashRef.current) {
      if (P.flash) {
        if (flashStart.current < 0) flashStart.current = t;
        const e = (t - flashStart.current) / 0.22;
        if (e <= 1) {
          flashRef.current.visible = true;
          flashRef.current.position.set(P.flash[0], P.flash[1], P.flash[2]);
          flashRef.current.scale.setScalar(0.18 + e * 0.6);
          flashRef.current.quaternion.copy(state.camera.quaternion);
          flashMat.opacity = 0.85 * (1 - e);
        } else {
          flashRef.current.visible = false;
        }
      } else {
        flashStart.current = -1;
        flashRef.current.visible = false;
      }
    }

    // Motion trails (sampled, not every frame, so they span a whole loop)
    sampleAcc.current += delta;
    if (sampleAcc.current >= TRAIL_SAMPLE_DT) {
      sampleAcc.current = 0;
      // Feet never teleport, so the trail just trails (high threshold = never reset).
      pushSample(footBuf.current, P.activeFoot, 99);
      if (P.ballHidden) {
        prevBallHidden.current = true;
      } else {
        // Start a fresh trail when the ball reappears after flying off-screen.
        if (prevBallHidden.current) ballBuf.current.length = 0;
        prevBallHidden.current = false;
        pushSample(ballBuf.current, P.ball, 99);
      }
      trailRef.current = { foot: footBuf.current.slice(), ball: ballBuf.current.slice() };
    }

    // Live knee read-out (the same number the AI scores) — throttled
    kneeAcc.current += delta;
    if (kneeAcc.current >= 0.15) {
      kneeAcc.current = 0;
      const watched = pose.watchLeg === "L" ? skel.kneeAngleL : skel.kneeAngleR;
      const ideal = motion.idealKnee;
      const ok = !ideal || (watched >= ideal[0] && watched <= ideal[1]);
      onKnee({ deg: Math.round(watched), ok });
    }
  });

  return (
    <group>
      {BONES.map((b, i) => (
        <mesh
          key={i}
          geometry={cyl}
          material={matOf(b[3])}
          ref={(el) => {
            boneRefs.current[i] = el;
          }}
        />
      ))}
      {JOINTS.map(([name, , m]) => (
        <mesh
          key={name}
          geometry={sph}
          material={matOf(m)}
          ref={(el) => {
            jointRefs.current[name] = el;
          }}
        />
      ))}

      <mesh ref={bootL} material={bootMat}>
        <boxGeometry args={[0.34, 0.12, 0.18]} />
      </mesh>
      <mesh ref={bootR} material={bootMat}>
        <boxGeometry args={[0.34, 0.12, 0.18]} />
      </mesh>

      <group ref={headRef}>
        <mesh geometry={sph} material={bodyMat} scale={[0.3, 0.27, 0.3]} />
        <mesh material={visorMat} position={[0, 0.01, 0.2]}>
          <boxGeometry args={[0.36, 0.16, 0.16]} />
        </mesh>
        <mesh geometry={sph} material={eyeMat} position={[-0.1, 0.02, 0.31]} scale={0.05} />
        <mesh geometry={sph} material={eyeMat} position={[0.1, 0.02, 0.31]} scale={0.05} />
        <mesh material={bodyMat} position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.24, 8]} />
        </mesh>
        <mesh geometry={sph} material={eyeMat} position={[0, 0.47, 0]} scale={0.045} />
      </group>

      <mesh ref={ballRef} geometry={sph} material={ballMat} scale={BALL_WORLD_R} castShadow />

      <mesh ref={flashRef} material={flashMat} visible={false}>
        <ringGeometry args={[0.26, 0.36, 28]} />
      </mesh>

      {wall && (
        <mesh material={bodyMat} position={[wall[0], 0.8, wall[2]]}>
          <boxGeometry args={[0.16, 1.6, 0.9]} />
        </mesh>
      )}
    </group>
  );
}

function setBoot(mesh: THREE.Mesh | null, foot: V3, view: "front" | "side") {
  if (!mesh) return;
  const lift = Math.max(0, foot[1]);
  const tilt = Math.min(lift * 0.9, 0.55);
  if (view === "side") {
    mesh.position.set(foot[0] + 0.06, foot[1] + 0.03, foot[2]);
    mesh.rotation.set(0, 0, -tilt);
  } else {
    mesh.position.set(foot[0], foot[1] + 0.03, foot[2] + 0.06);
    mesh.rotation.set(-tilt, Math.PI / 2, 0);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Motion trails — re-render at ~16fps off a shared ref, kept out of the rig
// so the 60fps rig never triggers React renders.
// ────────────────────────────────────────────────────────────────────────
function Trails({ trailRef }: { trailRef: React.MutableRefObject<{ foot: V3[]; ball: V3[] }> }) {
  const [data, setData] = useState<{ foot: V3[]; ball: V3[] }>({ foot: [], ball: [] });
  const acc = useRef(0);
  useFrame((_, delta) => {
    acc.current += delta;
    if (acc.current >= 0.06) {
      acc.current = 0;
      setData(trailRef.current);
    }
  });
  return (
    <>
      {data.ball.length >= 2 && (
        <Line points={data.ball} vertexColors={fadeColors(data.ball, "#fde68a")} lineWidth={3} transparent />
      )}
      {data.foot.length >= 2 && (
        <Line points={data.foot} vertexColors={fadeColors(data.foot, GREEN_BRIGHT)} lineWidth={2.5} transparent />
      )}
    </>
  );
}

function Scene({
  motion,
  reduced,
  onKnee,
}: {
  motion: DrillMotion;
  reduced: boolean;
  onKnee: (k: KneeInfo) => void;
}) {
  const trailRef = useRef<{ foot: V3[]; ball: V3[] }>({ foot: [], ball: [] });
  const target: [number, number, number] = motion.view === "side" ? [0.3, 1.3, 0] : [0, 1.35, 0];

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 9, 17]} />

      <hemisphereLight args={["#cfe8ff", "#0a140d", 0.95]} />
      <directionalLight position={[3.5, 6, 4]} intensity={1.5} color="#ffffff" />
      <directionalLight position={[-4, 3, -2]} intensity={0.55} color="#86efac" />

      <RobotRig motion={motion} reduced={reduced} onKnee={onKnee} trailRef={trailRef} />
      <Trails trailRef={trailRef} />

      {/* Night pitch: dark plane + faint grid + soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#0e2719" roughness={1} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.002, 0]}
        args={[16, 16]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor="#1c3a28"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#27523a"
        fadeDistance={15}
        fadeStrength={1.5}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={9} blur={2.6} far={4.5} color="#000000" />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        autoRotate={!reduced}
        autoRotateSpeed={0.7}
        target={target}
        minPolarAngle={0.55}
        maxPolarAngle={1.72}
      />
    </>
  );
}

export default function RobotCoach3D({ drillName, category, compact = false, className }: RobotCoachProps) {
  const motion = getMotionForDrill(drillName, category);
  const reduced = useMemo(prefersReducedMotion, []);
  const [knee, setKnee] = useState<KneeInfo | null>(null);

  const onKnee = useCallback((k: KneeInfo) => {
    setKnee((prev) => (prev && prev.deg === k.deg && prev.ok === k.ok ? prev : k));
  }, []);

  const camera = useMemo(
    () =>
      motion.view === "side"
        ? { position: [3.6, 1.75, 5.2] as [number, number, number], fov: 34 }
        : { position: [0, 1.7, 6.3] as [number, number, number], fov: 32 },
    [motion.view],
  );

  // Memoised so the throttled knee state below never forces a Canvas reconcile.
  const scene = useMemo(
    () => (
      <Canvas
        camera={camera}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        frameloop="always"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Scene motion={motion} reduced={reduced} onKnee={onKnee} />
      </Canvas>
    ),
    [motion, reduced, onKnee, camera],
  );

  const ideal = motion.idealKnee;

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {scene}

      {/* ROBO-COACH badge */}
      <div
        style={{ position: "absolute", top: 10, left: 10 }}
        className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white pointer-events-none"
      >
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        Robo-Coach 3D
      </div>

      {/* Live knee meter — the same number the AI scores */}
      {!compact && knee && (
        <div
          style={{ position: "absolute", bottom: 10, left: 10 }}
          className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 font-mono text-[11px] pointer-events-none"
        >
          <span style={{ color: knee.ok ? GREEN_BRIGHT : "#fbbf24", fontWeight: 700 }}>
            KNEE {knee.deg}° {knee.ok ? "✓" : "…"}
          </span>
          {ideal && (
            <span className="text-white/60">
              ideal {ideal[0]}–{ideal[1]}°
            </span>
          )}
        </div>
      )}
    </div>
  );
}
