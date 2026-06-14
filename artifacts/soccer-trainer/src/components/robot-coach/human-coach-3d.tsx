// HUMAN COACH (3D): a realistic rigged human (Mixamo-skinned glTF) that
// demonstrates each drill. The same physics-checked choreography (motions.ts)
// that drove the robot now drives the human's legs via two-bone inverse
// kinematics, with the model's idle clip kept for natural arm/torso life and a
// procedural forward lean layered on. Keeps the 3D ball and fading motion
// trails that show the path of the acting foot and the ball.
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, Line, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { BALL_R, GROUND_Y, THIGH, SHIN, clamp, type DrillMotion } from "./engine";
import { getMotionForDrill } from "./motions";
import type { V3 } from "./map3d";

interface HumanCoachProps {
  drillName?: string | null;
  category?: string | null;
  compact?: boolean;
  className?: string;
}

const GREEN_BRIGHT = "#4ade80";
const BG = "#0b1220";
const MODEL_URL = `${import.meta.env.BASE_URL}models/soldier.glb`;
const TARGET_HEIGHT = 1.75; // world units (≈ metres) the model is scaled to
const CENTER_X = 200; // svg stage centre
const LEG_SPAN = THIGH + SHIN; // 92 svg px of leg reach
const TRAIL_LEN = 44;
const TRAIL_SAMPLE_DT = 0.04;
const HIP_LIFT = 0.035; // world units: lift the stance so it's not a deep squat
const HEAD_PITCH = 0.24; // radians: tilt head/neck down to watch the ball
const MAX_REACH = 0.985; // never fully lock the knee (avoids hyperextension look)
const BALL_SCALE = 1.5; // bigger than life-size so the ball reads clearly
const BALL_FRONT = 0.12; // nudge the ball toward the camera so it stays in front of the body

useGLTF.preload(MODEL_URL);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function isStill(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("still") === "1"
  );
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
    [0.5, 0.22, 0.1], [0.2, 0.5, 0.092], [0.8, 0.5, 0.092],
    [0.36, 0.8, 0.082], [0.64, 0.8, 0.082], [0.5, 0.52, 0.06],
  ];
  for (const [u, v, r] of patches) {
    ctx.beginPath();
    const cx = u * s, cy = v * s, rad = r * s;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function fadeColors(points: V3[], hex: string): THREE.Color[] {
  const base = new THREE.Color(hex);
  const n = points.length;
  return points.map((_, i) => base.clone().multiplyScalar(((i + 1) / n) ** 2));
}

function pushSample(buf: V3[], p: V3) {
  buf.push(p);
  if (buf.length > TRAIL_LEN) buf.shift();
}

interface KneeInfo { deg: number; ok: boolean }

// ── IK math (reused scratch objects; safe within one synchronous frame) ────
const _hip = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tc = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _toe = new THREE.Vector3();
const _A = new THREE.Vector3();
const _d = new THREE.Vector3();
const _dl = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _wpos = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Point `bone`'s child-axis (rest direction `childDir`, in bone-local space)
 *  straight at the world position `target`. */
function aimBone(bone: THREE.Object3D, childDir: THREE.Vector3, target: THREE.Vector3) {
  bone.getWorldPosition(_A);
  _d.copy(target).sub(_A);
  if (_d.lengthSq() < 1e-10) return;
  _d.normalize();
  bone.parent!.getWorldQuaternion(_pq).invert();
  _dl.copy(_d).applyQuaternion(_pq).normalize();
  bone.quaternion.setFromUnitVectors(childDir, _dl);
  bone.updateMatrixWorld(true);
}

interface LegBones {
  up: THREE.Bone; leg: THREE.Bone; foot: THREE.Bone;
  dUp: THREE.Vector3; dLeg: THREE.Vector3; dFoot: THREE.Vector3;
}

/** Analytic two-bone IK: bend `up`→`leg` so the ankle reaches `target`, with
 *  the knee pushed toward `pole`, then level the foot toward `forward`. */
function solveLeg(b: LegBones, target: THREE.Vector3, L1: number, L2: number, pole: THREE.Vector3, forward: THREE.Vector3) {
  b.up.getWorldPosition(_hip);
  _to.copy(target).sub(_hip);
  let dist = _to.length();
  const maxR = (L1 + L2) * MAX_REACH; // keep a slight knee bend, never lock straight
  const minR = Math.abs(L1 - L2) + 1e-3;
  dist = clamp(dist, minR, maxR);
  _dir.copy(_to).setLength(dist);
  _tc.copy(_hip).add(_dir); // reachable ankle target
  _dir.normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _mid.copy(_hip).addScaledVector(_dir, a);
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
  _perp.normalize();
  _knee.copy(_mid).addScaledVector(_perp, h);
  aimBone(b.up, b.dUp, _knee);
  aimBone(b.leg, b.dLeg, _tc);
  // Foot leveling: toe points forward, only tipping down as the foot rises.
  const lift = clamp(target.y / (0.35 * TARGET_HEIGHT), 0, 1);
  _toe.copy(forward).setY(-0.12 - lift * 0.5).normalize().multiplyScalar(L2 * 0.6).add(_tc);
  aimBone(b.foot, b.dFoot, _toe);
}

// ────────────────────────────────────────────────────────────────────────
function HumanRig({
  motion,
  reduced,
  freezePhase,
  onKnee,
  trailRef,
}: {
  motion: DrillMotion;
  reduced: boolean;
  freezePhase: number | null;
  onKnee: (k: KneeInfo) => void;
  trailRef: React.MutableRefObject<{ foot: V3[]; ball: V3[] }>;
}) {
  const { scene, animations } = useGLTF(MODEL_URL);
  const model = useMemo(() => skeletonClone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);

  const ballTex = useMemo(() => makeBallTexture(), []);
  const ballRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: GREEN_BRIGHT, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    [],
  );

  const side = motion.view === "side";
  const ballSpin = useRef(0);
  const prevBallX = useRef(0);
  const flashStart = useRef(-1);
  const footBuf = useRef<V3[]>([]);
  const ballBuf = useRef<V3[]>([]);
  const sampleAcc = useRef(0);
  const kneeAcc = useRef(0);
  const prevBallHidden = useRef(false);

  // World forward / knee-pole directions for this drill's view.
  const forward = useMemo(() => (side ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)), [side]);

  // One-time rig setup: scale, orient, capture bones + rest IK data.
  const rig = useMemo(() => {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = TARGET_HEIGHT / (size.y || 1);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.set(0, -box2.min.y, 0);
    model.rotation.y = side ? -Math.PI / 2 : Math.PI; // face +X (side) / +Z (front)
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });

    const bones: Record<string, THREE.Bone> = {};
    model.traverse((o) => {
      const b = o as THREE.Bone;
      // GLTFLoader sanitises "mixamorig:LeftLeg" → "mixamorigLeftLeg"; also
      // handle the raw colon and RPM-style names with no prefix at all.
      if (b.isBone) bones[b.name.replace(/^mixamorig[:_]?/i, "")] = b;
    });
    if (!bones.LeftLeg || !bones.RightLeg || !bones.Hips) {
      // eslint-disable-next-line no-console
      console.error("[human] missing bones; have:", Object.keys(bones).join(","));
    }
    // child-axis directions are LOCAL (normalised → scale-independent).
    const dirOf = (child: THREE.Bone) => child.position.clone().normalize();
    const legL: LegBones = {
      up: bones.LeftUpLeg, leg: bones.LeftLeg, foot: bones.LeftFoot,
      dUp: dirOf(bones.LeftLeg), dLeg: dirOf(bones.LeftFoot), dFoot: dirOf(bones.LeftToeBase),
    };
    const legR: LegBones = {
      up: bones.RightUpLeg, leg: bones.RightLeg, foot: bones.RightFoot,
      dUp: dirOf(bones.RightLeg), dLeg: dirOf(bones.RightFoot), dFoot: dirOf(bones.RightToeBase),
    };
    // Lengths/width measured in WORLD units (account for every parent scale,
    // incl. the intermediate "Character" node), so IK targets share the scene.
    model.updateMatrixWorld(true);
    const wp = (b: THREE.Bone) => b.getWorldPosition(new THREE.Vector3());
    const L1 = wp(bones.LeftUpLeg).distanceTo(wp(bones.LeftLeg));
    const L2 = wp(bones.LeftLeg).distanceTo(wp(bones.LeftFoot));
    const legLen = L1 + L2;
    const S = (legLen * 0.96) / LEG_SPAN; // svg px → world units
    const depth = wp(bones.LeftUpLeg).distanceTo(wp(bones.RightUpLeg)) / 2 || 0.09;

    const spine = [bones.Spine, bones.Spine1, bones.Spine2].filter(Boolean);
    const spineRest = spine.map((b) => b.quaternion.clone());
    // Rest (bind) rotations we re-assert each frame so the idle clip can't tilt
    // the pelvis/head into an unnatural lean.
    const hipsRest = bones.Hips.quaternion.clone();
    const neckRest = bones.Neck?.quaternion.clone();
    const headRest = bones.Head?.quaternion.clone();

    // Start the idle clip for natural breathing / arm life on the upper body.
    const idle = animations.find((a) => /idle/i.test(a.name)) ?? animations[0];
    if (idle) mixer.clipAction(idle).play();

    return {
      bones, legL, legR, L1, L2, legLen, S, depth, spine, spineRest,
      hips: bones.Hips, hipsRest, neck: bones.Neck, head: bones.Head, neckRest, headRest,
      ballR: BALL_R * S * BALL_SCALE,
    };
  }, [model, animations, mixer, side]);

  // svg point → world. depthZ chooses the body-relative depth.
  const toWorld = (x: number, y: number, z: number, out: THREE.Vector3) =>
    out.set((x - CENTER_X) * rig.S, (GROUND_Y - y) * rig.S, z);

  const ballZ = side ? -rig.depth : 0.06;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const frozen = freezePhase != null;
    const phase = frozen ? freezePhase : reduced ? 0.3 : (t / motion.duration) % 1;
    const pose = motion.pose(phase);

    mixer.update(frozen || reduced ? 0 : delta); // idle drives arms/head/breath

    // 1) Pelvis: place the Hips bone at the choreography pelvis (world), lifted
    //    a touch so the athlete stands tall rather than in a deep squat. Re-assert
    //    the rest orientation so the idle clip can't tip the whole torso back.
    const pelvisW = toWorld(pose.pelvis.x, pose.pelvis.y, 0, _wpos);
    pelvisW.y += HIP_LIFT;
    rig.hips.parent!.updateWorldMatrix(true, false);
    rig.hips.position.copy(rig.hips.parent!.worldToLocal(_A.copy(pelvisW)));
    rig.hips.quaternion.copy(rig.hipsRest);
    rig.hips.updateMatrixWorld(true);

    // 2) Forward lean (over the ball) layered on the stabilised spine.
    const leanRad = (pose.torsoLean * Math.PI) / 180;
    for (let i = 0; i < rig.spine.length; i++) {
      _qx.setFromAxisAngle(X_AXIS, leanRad * 0.5);
      rig.spine[i].quaternion.copy(rig.spineRest[i]).multiply(_qx);
    }
    // Head/neck watch the ball (gentle downward tilt) instead of the idle look-up.
    if (rig.neck && rig.neckRest) rig.neck.quaternion.copy(rig.neckRest).multiply(_qh.setFromAxisAngle(X_AXIS, HEAD_PITCH));
    if (rig.head && rig.headRest) rig.head.quaternion.copy(rig.headRest).multiply(_qh.setFromAxisAngle(X_AXIS, HEAD_PITCH));
    rig.hips.updateMatrixWorld(true);

    // 3) Legs via IK. footL/footR z: side → ±depth, front → small forward.
    const lz = side ? rig.depth : ballZ;
    const rz = side ? -rig.depth : ballZ;
    const footLT = toWorld(pose.footL.x, pose.footL.y, lz, _to.clone());
    const footRT = toWorld(pose.footR.x, pose.footR.y, rz, _knee.clone());
    solveLeg(rig.legL, footLT, rig.L1, rig.L2, forward, forward);
    solveLeg(rig.legR, footRT, rig.L1, rig.L2, forward, forward);

    // 4) Ball — nudge horizontally toward the camera so it stays in FRONT of
    //    the body (not buried in the legs) and reads as a clear, whole ball.
    const bx = (pose.ball.x - CENTER_X) * rig.S;
    const by = (GROUND_Y - pose.ball.y) * rig.S;
    const cam = state.camera.position;
    let ox = cam.x - bx;
    let oz = cam.z - ballZ;
    const ol = Math.hypot(ox, oz) || 1;
    ox = (ox / ol) * BALL_FRONT;
    oz = (oz / ol) * BALL_FRONT;
    const ballWX = bx + ox;
    const ballWZ = ballZ + oz;
    if (ballRef.current) {
      ballRef.current.visible = !pose.ball.hidden;
      ballRef.current.position.set(ballWX, by, ballWZ);
      const dx = bx - prevBallX.current;
      prevBallX.current = bx;
      ballSpin.current -= dx / rig.ballR;
      ballRef.current.rotation.set(ballSpin.current * 0.5, ballSpin.current, 0);
    }

    // 5) Contact flash
    if (flashRef.current) {
      if (pose.flash) {
        if (flashStart.current < 0) flashStart.current = t;
        const e = (t - flashStart.current) / 0.22;
        if (e <= 1) {
          flashRef.current.visible = true;
          flashRef.current.position.set((pose.flash.x - CENTER_X) * rig.S, (GROUND_Y - pose.flash.y) * rig.S, ballZ);
          flashRef.current.scale.setScalar(0.05 + e * 0.18);
          flashRef.current.quaternion.copy(state.camera.quaternion);
          flashMat.opacity = 0.85 * (1 - e);
        } else flashRef.current.visible = false;
      } else { flashStart.current = -1; flashRef.current.visible = false; }
    }

    // 6) Motion trails (acting foot + ball), sampled
    sampleAcc.current += delta;
    if (sampleAcc.current >= TRAIL_SAMPLE_DT) {
      sampleAcc.current = 0;
      const af = pose.watchLeg === "L" ? footLT : footRT;
      pushSample(footBuf.current, [af.x, af.y, af.z]);
      if (pose.ball.hidden) {
        prevBallHidden.current = true;
      } else {
        if (prevBallHidden.current) ballBuf.current.length = 0;
        prevBallHidden.current = false;
        pushSample(ballBuf.current, [ballWX, by, ballWZ]);
      }
      trailRef.current = { foot: footBuf.current.slice(), ball: ballBuf.current.slice() };
    }

    // 7) Knee read-out (throttled)
    kneeAcc.current += delta;
    if (kneeAcc.current >= 0.15) {
      kneeAcc.current = 0;
      // Approximate knee angle from the IK foot reach (matches the AI metric).
      const target = pose.watchLeg === "L" ? footLT : footRT;
      rig.legL.up.getWorldPosition(_A);
      const reach = clamp(_A.distanceTo(target), 0, rig.legLen);
      const cos = clamp((rig.L1 * rig.L1 + rig.L2 * rig.L2 - reach * reach) / (2 * rig.L1 * rig.L2), -1, 1);
      const deg = Math.round((Math.acos(cos) * 180) / Math.PI);
      const ideal = motion.idealKnee;
      const ok = !ideal || (deg >= ideal[0] && deg <= ideal[1]);
      onKnee({ deg, ok });
    }
  });

  return (
    <group>
      <primitive object={model} />
      <mesh ref={ballRef} castShadow renderOrder={2}>
        <sphereGeometry args={[rig.ballR, 32, 24]} />
        <meshStandardMaterial map={ballTex} roughness={0.4} metalness={0.02} emissive="#ffffff" emissiveIntensity={0.12} />
        {/* soft glow halo so the ball pops against the dark pitch */}
        <mesh scale={1.35}>
          <sphereGeometry args={[rig.ballR, 16, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </mesh>
      <mesh ref={flashRef} material={flashMat} visible={false}>
        <ringGeometry args={[0.7, 1.0, 28]} />
      </mesh>
    </group>
  );
}

function Trails({ trailRef }: { trailRef: React.MutableRefObject<{ foot: V3[]; ball: V3[] }> }) {
  const [data, setData] = useState<{ foot: V3[]; ball: V3[] }>({ foot: [], ball: [] });
  const acc = useRef(0);
  useFrame((_, delta) => {
    acc.current += delta;
    if (acc.current >= 0.06) { acc.current = 0; setData(trailRef.current); }
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

function Lighting() {
  return (
    <>
      <hemisphereLight args={["#bcd9ff", "#0a140d", 0.55]} />
      <directionalLight
        position={[3.5, 6, 3]} intensity={2.4} color="#fff6e6" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004}
        shadow-camera-near={0.5} shadow-camera-far={20}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={5} shadow-camera-bottom={-1}
      />
      <directionalLight position={[-5, 3, -3]} intensity={0.5} color="#86efac" />
      <directionalLight position={[0, 2, -6]} intensity={0.7} color="#9ec5ff" />
    </>
  );
}

function Scene({ motion, reduced, freezePhase, onKnee, still }: { motion: DrillMotion; reduced: boolean; freezePhase: number | null; onKnee: (k: KneeInfo) => void; still: boolean }) {
  const trailRef = useRef<{ foot: V3[]; ball: V3[] }>({ foot: [], ball: [] });
  const target: [number, number, number] = [0, 0.85, 0];
  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 6, 16]} />
      <Lighting />
      <Suspense fallback={null}>
        <HumanRig motion={motion} reduced={reduced} freezePhase={freezePhase} onKnee={onKnee} trailRef={trailRef} />
      </Suspense>
      <Trails trailRef={trailRef} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 56]} />
        <meshStandardMaterial color="#123a26" roughness={1} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.004, 0]} args={[18, 18]} cellSize={0.4} cellThickness={0.6} cellColor="#1c3a28"
        sectionSize={2} sectionThickness={1} sectionColor="#2c5a3f" fadeDistance={16} fadeStrength={1.5} infiniteGrid
      />
      <ContactShadows position={[0, 0.012, 0]} opacity={0.5} scale={7} blur={2.4} far={3} color="#000000" />
      <OrbitControls
        enablePan={false} enableZoom={false} enableDamping
        autoRotate={!reduced && !still} autoRotateSpeed={0.6}
        target={target} minPolarAngle={0.7} maxPolarAngle={1.62}
      />
    </>
  );
}

export default function HumanCoach3D({ drillName, category, compact = false, className }: HumanCoachProps) {
  const motion = getMotionForDrill(drillName, category);
  const reduced = useMemo(prefersReducedMotion, []);
  const freezePhase = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("phase");
    return p != null && p !== "" ? parseFloat(p) : null;
  }, []);
  const still = useMemo(() => isStill() || freezePhase != null, [freezePhase]);
  const [knee, setKnee] = useState<KneeInfo | null>(null);
  const onKnee = useCallback((k: KneeInfo) => {
    setKnee((prev) => (prev && prev.deg === k.deg && prev.ok === k.ok ? prev : k));
  }, []);

  const camera = useMemo(
    () =>
      motion.view === "side"
        ? { position: [3.0, 1.35, 3.4] as [number, number, number], fov: 38 }
        : { position: [0, 1.3, 4.2] as [number, number, number], fov: 36 },
    [motion.view],
  );

  const scene = useMemo(
    () => (
      <Canvas
        shadows camera={camera} dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Scene motion={motion} reduced={reduced} freezePhase={freezePhase} onKnee={onKnee} still={still} />
      </Canvas>
    ),
    [motion, reduced, freezePhase, onKnee, camera, still],
  );

  const ideal = motion.idealKnee;
  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {scene}
      <div
        style={{ position: "absolute", top: 10, left: 10 }}
        className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white pointer-events-none"
      >
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        Coach
      </div>
      {!compact && knee && (
        <div
          style={{ position: "absolute", bottom: 10, left: 10 }}
          className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 font-mono text-[11px] pointer-events-none"
        >
          <span style={{ color: knee.ok ? GREEN_BRIGHT : "#fbbf24", fontWeight: 700 }}>
            KNEE {knee.deg}° {knee.ok ? "✓" : "…"}
          </span>
          {ideal && <span className="text-white/60">ideal {ideal[0]}–{ideal[1]}°</span>}
        </div>
      )}
    </div>
  );
}
