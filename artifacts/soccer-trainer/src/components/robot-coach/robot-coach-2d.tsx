// ROBO-COACH (2D): the original SVG robot. Kept as the graceful fallback for
// the WebGL version (robot-coach-3d.tsx) — shown while the 3D bundle loads and
// if WebGL is unavailable. Demonstrates each drill with the exact form the AI
// scores as "excellent", in the same glowing skeleton style the camera uses.
import { useEffect, useRef, useState } from "react";
import {
  buildSkeleton,
  BALL_R,
  GROUND_Y,
  STAGE,
  clamp,
  type RobotSkeleton,
  type Vec,
} from "./engine";
import { getMotionForDrill } from "./motions";

interface RobotCoachProps {
  drillName?: string | null;
  category?: string | null;
  /** Compact mode (picture-in-picture): hides the knee meter */
  compact?: boolean;
  className?: string;
}

const LEG = "#16a34a";
const LEG_GLOW = "rgba(22, 163, 74, 0.28)";
const BODY = "rgba(255, 255, 255, 0.78)";
const BODY_DIM = "rgba(255, 255, 255, 0.38)";

export default function RobotCoach2D({
  drillName,
  category,
  compact = false,
  className,
}: RobotCoachProps) {
  const motion = getMotionForDrill(drillName, category);
  const [clock, setClock] = useState(0);
  const frameRef = useRef<number | null>(null);
  const prevBallRef = useRef<Vec | null>(null);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) return;
    const start = performance.now();
    const tick = (now: number) => {
      setClock((now - start) / 1000);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [reducedMotion, motion.id]);

  const phase = reducedMotion ? 0.3 : (clock / motion.duration) % 1;
  const pose = motion.pose(phase);
  const skel = buildSkeleton(pose, motion.view);

  // Ball speed (for speed lines when it's really flying)
  const prevBall = prevBallRef.current;
  prevBallRef.current = { x: pose.ball.x, y: pose.ball.y };
  const ballDx = prevBall ? pose.ball.x - prevBall.x : 0;
  const ballDy = prevBall ? pose.ball.y - prevBall.y : 0;
  const ballFast = Math.hypot(ballDx, ballDy) > 7;

  // Blink every ~3.4 s
  const blink = clock % 3.4 < 0.13;

  const watched = pose.watchLeg === "L" ? skel.kneeAngleL : skel.kneeAngleR;
  const ideal = motion.idealKnee;
  const kneeOk = !ideal || (watched >= ideal[0] && watched <= ideal[1]);

  const side = motion.view === "side";
  const farOpacity = side ? 0.45 : 1;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${STAGE.w} ${STAGE.h}`}
        className="w-full h-full block"
        role="img"
        aria-label={`Robot coach demonstrating ${drillName ?? "a drill"}`}
      >
        <defs>
          <linearGradient id="rc-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="78%" stopColor="#0d1b14" />
            <stop offset="100%" stopColor="#123222" />
          </linearGradient>
          <radialGradient id="rc-spot" cx="0.5" cy="0.42" r="0.65">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* Night training pitch */}
        <rect width={STAGE.w} height={STAGE.h} fill="url(#rc-bg)" rx="10" />
        <rect width={STAGE.w} height={STAGE.h} fill="url(#rc-spot)" rx="10" />
        <line
          x1="14" y1={GROUND_Y + 8} x2={STAGE.w - 14} y2={GROUND_Y + 8}
          stroke="rgba(255,255,255,0.22)" strokeWidth="2"
        />
        {/* Training wall (wall-pass drill) */}
        {pose.ball.wall !== undefined && (
          <g>
            <rect
              x={pose.ball.wall} y={GROUND_Y - 78} width="10" height="86"
              rx="2" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.4)" strokeWidth="2"
            />
            {[0, 1, 2, 3].map((i) => (
              <line
                key={i}
                x1={pose.ball.wall} y1={GROUND_Y - 60 + i * 18}
                x2={pose.ball.wall! + 10} y2={GROUND_Y - 60 + i * 18}
                stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
              />
            ))}
          </g>
        )}
        <ellipse
          cx={STAGE.w / 2} cy={GROUND_Y + 8} rx="64" ry="9"
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2"
        />

        {/* Shadows */}
        <ellipse
          cx={pose.pelvis.x} cy={GROUND_Y + 7}
          rx={34} ry={5.5} fill="rgba(0,0,0,0.5)"
        />
        {!pose.ball.hidden && (
          <ellipse
            cx={pose.ball.x}
            cy={GROUND_Y + 6}
            rx={clamp(12 - (GROUND_Y - pose.ball.y) * 0.04, 5, 12)}
            ry={3.4}
            fill="rgba(0,0,0,0.45)"
            opacity={clamp(1 - (GROUND_Y - pose.ball.y) / 260, 0.25, 1)}
          />
        )}

        {/* Far limbs first (side view depth) */}
        <g opacity={farOpacity}>
          <Limb a={skel.shoulderL} b={skel.elbowL} c={skel.handL} color={side ? BODY_DIM : BODY} width={4.5} />
          <Leg skel={skel} which="L" dim={side} />
        </g>

        {/* Torso */}
        <line
          x1={pose.pelvis.x} y1={pose.pelvis.y} x2={skel.neck.x} y2={skel.neck.y}
          stroke={BODY} strokeWidth="6.5" strokeLinecap="round"
        />
        {/* Chest panel with a pulsing power light */}
        <g
          transform={`translate(${(pose.pelvis.x + skel.neck.x) / 2}, ${(pose.pelvis.y + skel.neck.y) / 2}) rotate(${pose.torsoLean})`}
        >
          <rect x="-9" y="-13" width="18" height="26" rx="5" fill="rgba(255,255,255,0.14)" stroke={BODY_DIM} strokeWidth="1.5" />
          <circle
            cx="0" cy="-3" r="3"
            fill={LEG}
            opacity={0.55 + 0.45 * Math.abs(Math.sin(clock * 2.6))}
          />
        </g>

        {/* Near leg */}
        <Leg skel={skel} which="R" dim={false} />

        {/* Head */}
        <RobotHead skel={skel} ball={pose.ball} lean={pose.torsoLean} blink={blink} clock={clock} />

        {/* Near arm */}
        <Limb a={skel.shoulderR} b={skel.elbowR} c={skel.handR} color={BODY} width={4.5} />

        {/* Ball */}
        {!pose.ball.hidden && (
          <Ball ball={pose.ball} fast={ballFast} dx={ballDx} dy={ballDy} />
        )}

        {/* Contact flash */}
        {pose.flash && (
          <>
            <circle cx={pose.flash.x} cy={pose.flash.y} r={BALL_R + 9} fill="none" stroke="rgba(22,163,74,0.85)" strokeWidth="3.5" />
            <circle cx={pose.flash.x} cy={pose.flash.y} r={BALL_R + 16} fill="none" stroke="rgba(22,163,74,0.35)" strokeWidth="2" />
          </>
        )}

        {/* Badge */}
        <g opacity="0.92">
          <rect x="12" y="12" width={compact ? 96 : 112} height="22" rx="11" fill="rgba(0,0,0,0.55)" />
          <circle cx="25" cy="23" r="4" fill={LEG} opacity={0.6 + 0.4 * Math.abs(Math.sin(clock * 3))} />
          <text x="34" y="27" fill="white" fontSize={compact ? 10 : 11} fontWeight="bold" fontFamily="ui-sans-serif, system-ui" letterSpacing="1">
            ROBO-COACH
          </text>
        </g>

        {/* Live knee meter — the same number the AI scores */}
        {!compact && (
          <g>
            <rect x="12" y={STAGE.h - 36} width="178" height="24" rx="12" fill="rgba(0,0,0,0.55)" />
            <text x="24" y={STAGE.h - 20} fill={kneeOk ? "#4ade80" : "#fbbf24"} fontSize="11.5" fontWeight="bold" fontFamily="ui-monospace, monospace">
              KNEE {Math.round(watched)}° {kneeOk ? "✓" : "…"}
            </text>
            {ideal && (
              <text x="108" y={STAGE.h - 20} fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="ui-monospace, monospace">
                ideal {ideal[0]}–{ideal[1]}°
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

function Limb({ a, b, c, color, width }: { a: Vec; b: Vec; c: Vec; color: string; width: number }) {
  const d = `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`;
  return (
    <>
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={b.x} cy={b.y} r={width * 0.62} fill={color} />
      <circle cx={c.x} cy={c.y} r={width * 0.72} fill={color} />
    </>
  );
}

function Leg({ skel, which, dim }: { skel: RobotSkeleton; which: "L" | "R"; dim: boolean }) {
  const hip = which === "L" ? skel.hipL : skel.hipR;
  const knee = which === "L" ? skel.kneeL : skel.kneeR;
  const foot = which === "L" ? skel.footL : skel.footR;
  const d = `M ${hip.x} ${hip.y} L ${knee.x} ${knee.y} L ${foot.x} ${foot.y}`;
  const lift = clamp((GROUND_Y - foot.y) * 0.55, 0, 24);
  return (
    <g opacity={dim ? 1 : 1}>
      {/* glow underlay, then the bone */}
      <path d={d} fill="none" stroke={LEG_GLOW} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={LEG} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={hip.x} cy={hip.y} r="4.6" fill={LEG} />
      <circle cx={knee.x} cy={knee.y} r="4.6" fill={LEG} />
      {/* boot: tilts toes-down as the foot lifts to strike */}
      <g transform={`translate(${foot.x}, ${foot.y}) rotate(${lift})`}>
        <rect x="-6" y="-3.4" width="19" height="7.5" rx="3.6" fill={LEG} />
      </g>
    </g>
  );
}

function RobotHead({
  skel, ball, lean, blink, clock,
}: {
  skel: RobotSkeleton; ball: Vec; lean: number; blink: boolean; clock: number;
}) {
  // Eyes look at the ball
  const dx = ball.x - skel.head.x;
  const dy = ball.y - skel.head.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (dx / len) * 2.3;
  const py = (dy / len) * 2.3;
  const tilt = clamp(lean * 0.6 + (dx / len) * 6, -14, 14);
  const antennaSway = Math.sin(clock * 3.1) * 4 - lean * 0.5;

  return (
    <g transform={`translate(${skel.head.x}, ${skel.head.y}) rotate(${tilt})`}>
      {/* antenna */}
      <line x1="0" y1="-13" x2={antennaSway} y2="-24" stroke={BODY_DIM} strokeWidth="2" strokeLinecap="round" />
      <circle cx={antennaSway} cy="-25.5" r="3" fill={LEG} opacity={0.65 + 0.35 * Math.abs(Math.sin(clock * 4))} />
      {/* head shell */}
      <rect x="-17" y="-14" width="34" height="27" rx="9" fill="rgba(255,255,255,0.16)" stroke={BODY} strokeWidth="2" />
      {/* visor */}
      <rect x="-12" y="-7" width="24" height="13" rx="6" fill="rgba(0,0,0,0.55)" />
      {/* eyes */}
      <g transform={`scale(1, ${blink ? 0.12 : 1})`}>
        <circle cx={-5 + px} cy={-0.5 + py} r="2.6" fill="#7dfca5" />
        <circle cx={5 + px} cy={-0.5 + py} r="2.6" fill="#7dfca5" />
      </g>
    </g>
  );
}

function Ball({ ball, fast, dx, dy }: { ball: Vec & { spin?: number }; fast: boolean; dx: number; dy: number }) {
  const spin = ball.spin !== undefined ? ball.spin : ball.x / BALL_R;
  const deg = (spin * 180) / Math.PI;
  const len = Math.hypot(dx, dy) || 1;
  const ux = -dx / len;
  const uy = -dy / len;
  return (
    <g>
      {fast && (
        <g stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round">
          <line x1={ball.x + ux * 18} y1={ball.y + uy * 18 - 5} x2={ball.x + ux * 34} y2={ball.y + uy * 34 - 5} />
          <line x1={ball.x + ux * 16} y1={ball.y + uy * 16 + 1} x2={ball.x + ux * 38} y2={ball.y + uy * 38 + 1} />
          <line x1={ball.x + ux * 18} y1={ball.y + uy * 18 + 7} x2={ball.x + ux * 32} y2={ball.y + uy * 32 + 7} />
        </g>
      )}
      <g transform={`translate(${ball.x}, ${ball.y}) rotate(${deg})`}>
        <circle r={BALL_R} fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
        <polygon
          points="0,-5.4 5.1,-1.7 3.2,4.4 -3.2,4.4 -5.1,-1.7"
          fill="#0f172a"
        />
        <path d={`M 0 ${-BALL_R} Q 7 -4 4.5 ${BALL_R - 3}`} fill="none" stroke="#0f172a" strokeWidth="1.2" opacity="0.5" />
        <path d={`M 0 ${-BALL_R} Q -7 -4 -4.5 ${BALL_R - 3}`} fill="none" stroke="#0f172a" strokeWidth="1.2" opacity="0.5" />
      </g>
    </g>
  );
}
