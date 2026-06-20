import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PoseCameraProps {
  isActive: boolean;
  onPoseUpdate: (metrics: any) => void;
  onRepDetected?: () => void;
  drillCategory?: string;
}

// Bone connections between MoveNet keypoints, for drawing the skeleton
const SKELETON_EDGES: Array<[number, number]> = [
  [5, 6],                    // shoulders
  [5, 7], [7, 9],            // left arm
  [6, 8], [8, 10],           // right arm
  [5, 11], [6, 12], [11, 12], // torso
  [11, 13], [13, 15],        // left leg
  [12, 14], [14, 16],        // right leg
];
const LEG_KEYPOINTS = new Set([11, 12, 13, 14, 15, 16]);

async function initBackend() {
  for (const backend of ["webgl", "cpu"] as const) {
    try {
      const ok = await tf.setBackend(backend);
      if (ok) { await tf.ready(); return; }
    } catch (_) { /* try next */ }
  }
  throw new Error("No TF backend available");
}

export default function PoseCamera({ isActive, onPoseUpdate, onRepDetected, drillCategory }: PoseCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseDetector, setPoseDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [ballDetector, setBallDetector] = useState<cocoSsd.ObjectDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const animationFrameId = useRef<number | null>(null);

  const lastBallSample = useRef<{ x: number; y: number; t: number } | null>(null);
  const prevBallVy = useRef<number | null>(null);
  const lastRepTime = useRef<number>(0);
  const onRepDetectedRef = useRef(onRepDetected);
  onRepDetectedRef.current = onRepDetected;

  // Foot-motion rep counting (reliable even when the small ball isn't detected):
  // count each quick foot movement / tap as a rep by spotting speed peaks.
  const lastFootPos = useRef<{ lx: number; ly: number; rx: number; ry: number; t: number } | null>(null);
  const footPrevSpeed = useRef(0);
  const footRising = useRef(false);

  // Read live props inside the rAF loop without restarting it.
  const isActiveRef = useRef(isActive);
  const drillCategoryRef = useRef(drillCategory);
  drillCategoryRef.current = drillCategory;
  // Reset rep trackers when a drill starts, so there's no false first rep.
  useEffect(() => {
    isActiveRef.current = isActive;
    if (isActive) {
      lastBallSample.current = null;
      prevBallVy.current = null;
      lastFootPos.current = null;
      footPrevSpeed.current = 0;
      footRising.current = false;
    }
  }, [isActive]);

  // Camera setup — runs immediately, never blocks on AI
  useEffect(() => {
    async function setupCamera() {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
        });
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      } catch (_) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoRef.current!.srcObject = stream;
          videoRef.current!.onloadedmetadata = () => setCameraReady(true);
        } catch {
          setError("Camera access is required. Please allow camera permissions and reload.");
        }
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Load AI models silently in background — camera shows immediately regardless
  useEffect(() => {
    async function loadModels() {
      try {
        await initBackend();
      } catch {
        console.warn("TF backend init failed — AI features disabled");
        setAiReady(true); // still let camera show
        return;
      }

      try {
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        setPoseDetector(detector);
      } catch (err) {
        console.error("Pose model failed (non-fatal):", err);
      }

      try {
        const objDetector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        setBallDetector(objDetector);
      } catch (err) {
        console.error("Ball detection model failed (non-fatal):", err);
      }

      setAiReady(true);
    }
    loadModels();
  }, []);

  // Free the AI models' memory — but ONLY when truly leaving the page
  // (refs, so loading the second model never disposes the first one)
  const poseDetectorRef = useRef(poseDetector);
  poseDetectorRef.current = poseDetector;
  const ballDetectorRef = useRef(ballDetector);
  ballDetectorRef.current = ballDetector;
  useEffect(() => {
    return () => {
      try {
        poseDetectorRef.current?.dispose();
        ballDetectorRef.current?.dispose();
      } catch (_) {}
    };
  }, []);

  // Live detection loop — starts as soon as the camera + a model are ready, so
  // you ALWAYS see yourself and your movement tracked in real time (the live
  // skeleton + ball ring). Rep counting and scoring only run while the drill is
  // actually going (isActiveRef), so nothing is counted before you press Start.
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!poseDetector && !ballDetector) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    async function detect() {
      if (video.readyState < 2) {
        raf = requestAnimationFrame(detect);
        return;
      }
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const active = isActiveRef.current;

      // Pose: always draw the skeleton (live "this is you"); only measure form
      // and count reps while the drill is running.
      if (poseDetector) {
        try {
          const poses = await poseDetector.estimatePoses(video);
          if (poses.length > 0) {
            drawSkeleton(ctx, poses[0]);
            if (active) {
              extractMetrics(poses[0]);
              detectFootReps(poses[0]);
            }
          }
        } catch (_) {}
      }

      // Ball: always show the live tracking ring; only count reps while running.
      if (ballDetector) {
        try {
          const objects = await ballDetector.detect(video);
          const ball = objects
            .filter(o => o.class === "sports ball" && o.score > 0.3)
            .sort((a, b) => b.score - a.score)[0];

          if (ball) {
            const cx = ball.bbox[0] + ball.bbox[2] / 2;
            const cy = ball.bbox[1] + ball.bbox[3] / 2;
            const r = Math.max(ball.bbox[2], ball.bbox[3]) / 2;

            // Draw ball indicator
            ctx.beginPath();
            ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI);
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
            ctx.fillStyle = "#16a34a";
            ctx.fill();

            if (active) {
              // Rep counting from real ball velocity (pixels per second)
              const now = Date.now();
              const prev = lastBallSample.current;
              if (prev && now > prev.t) {
                const dt = (now - prev.t) / 1000;
                const vx = (cx - prev.x) / dt;
                const vy = (cy - prev.y) / dt;
                const speed = Math.hypot(vx, vy);

                const isJuggling = drillCategoryRef.current === "juggling";
                let isRep: boolean;
                if (isJuggling) {
                  // A juggle = ball was falling (vy > 0) and is now kicked up
                  // (vy clearly negative). Catches each touch, not just big kicks.
                  isRep = prevBallVy.current !== null && prevBallVy.current > 50 && vy < -150;
                } else {
                  // A kick/pass = sudden burst of ball speed
                  isRep = speed > 900;
                }

                const cooldownMs = isJuggling ? 450 : 1000;
                if (isRep && now - lastRepTime.current > cooldownMs) {
                  lastRepTime.current = now;
                  onRepDetectedRef.current?.();
                  // Flash ring on rep
                  ctx.beginPath();
                  ctx.arc(cx, cy, r + 20, 0, 2 * Math.PI);
                  ctx.strokeStyle = "rgba(22, 163, 74, 0.8)";
                  ctx.lineWidth = 5;
                  ctx.stroke();
                }
                prevBallVy.current = vy;
              }
              lastBallSample.current = { x: cx, y: cy, t: now };
            }
          } else {
            lastBallSample.current = null;
            prevBallVy.current = null;
          }
        } catch (_) {}
      }

      raf = requestAnimationFrame(detect);
    }

    raf = requestAnimationFrame(detect);
    animationFrameId.current = raf;
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [poseDetector, ballDetector]);

  // Draw the detected body as a skeleton: glowing green legs (what we score),
  // softer white upper body.
  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    pose: poseDetection.Pose
  ) => {
    if (!pose.keypoints) return;
    const kp = pose.keypoints;
    const ok = (i: number) => kp[i] && (kp[i].score ?? 0) > 0.3;

    for (const [a, b] of SKELETON_EDGES) {
      if (!ok(a) || !ok(b)) continue;
      const isLeg = LEG_KEYPOINTS.has(a) && LEG_KEYPOINTS.has(b);
      ctx.beginPath();
      ctx.moveTo(kp[a].x, kp[a].y);
      ctx.lineTo(kp[b].x, kp[b].y);
      ctx.strokeStyle = isLeg ? "rgba(22, 163, 74, 0.9)" : "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = isLeg ? 5 : 3;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    for (let i = 5; i < kp.length; i++) {
      if (!ok(i)) continue;
      ctx.beginPath();
      ctx.arc(kp[i].x, kp[i].y, LEG_KEYPOINTS.has(i) ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = LEG_KEYPOINTS.has(i) ? "#16a34a" : "rgba(255, 255, 255, 0.85)";
      ctx.fill();
    }
  };

  // MoveNet keypoint indices
  const KP = {
    leftShoulder: 5, rightShoulder: 6,
    leftHip: 11, rightHip: 12,
    leftKnee: 13, rightKnee: 14,
    leftAnkle: 15, rightAnkle: 16,
  } as const;
  const MIN_SCORE = 0.3;

  // Angle (degrees) at point `center` between the lines center→a and center→b
  const angleAt = (
    center: poseDetection.Keypoint,
    a: poseDetection.Keypoint,
    b: poseDetection.Keypoint
  ): number => {
    const angle =
      Math.atan2(b.y - center.y, b.x - center.x) -
      Math.atan2(a.y - center.y, a.x - center.x);
    let deg = Math.abs((angle * 180) / Math.PI);
    if (deg > 180) deg = 360 - deg;
    return deg;
  };

  // Count a rep on each quick foot movement (a speed peak), normalised by body
  // size so it works whether the player is near or far from the camera. This is
  // far more reliable than detecting the small ball, so reps climb steadily as
  // the player works the drill.
  const detectFootReps = (pose: poseDetection.Pose) => {
    const kp = pose.keypoints;
    if (!kp) return;
    const okk = (i: number) => kp[i] && (kp[i].score ?? 0) > MIN_SCORE;
    const haveL = okk(KP.leftAnkle);
    const haveR = okk(KP.rightAnkle);
    if (!haveL && !haveR) {
      lastFootPos.current = null;
      return;
    }

    // Body scale = torso length (shoulder→hip), so thresholds are size-independent.
    let torso = 0;
    if (okk(KP.leftShoulder) && okk(KP.leftHip)) {
      torso = Math.hypot(kp[KP.leftShoulder].x - kp[KP.leftHip].x, kp[KP.leftShoulder].y - kp[KP.leftHip].y);
    } else if (okk(KP.rightShoulder) && okk(KP.rightHip)) {
      torso = Math.hypot(kp[KP.rightShoulder].x - kp[KP.rightHip].x, kp[KP.rightShoulder].y - kp[KP.rightHip].y);
    }
    torso = Math.max(torso, 40);

    const now = Date.now();
    const lx = haveL ? kp[KP.leftAnkle].x : NaN;
    const ly = haveL ? kp[KP.leftAnkle].y : NaN;
    const rx = haveR ? kp[KP.rightAnkle].x : NaN;
    const ry = haveR ? kp[KP.rightAnkle].y : NaN;

    const prev = lastFootPos.current;
    if (prev && now > prev.t) {
      const dt = (now - prev.t) / 1000;
      const sp = (x: number, y: number, px: number, py: number) =>
        Number.isFinite(x) && Number.isFinite(px) ? Math.hypot(x - px, y - py) / dt : 0;
      const speed = Math.max(sp(lx, ly, prev.lx, prev.ly), sp(rx, ry, prev.rx, prev.ry)) / torso;

      const HI = 1.8; // torso-lengths/sec — a real tap/kick clears this
      const cooldown = 250;
      if (speed > footPrevSpeed.current) footRising.current = true;
      // Just past a peak above HI → count one rep
      if (
        footRising.current &&
        speed < footPrevSpeed.current * 0.6 &&
        footPrevSpeed.current > HI &&
        now - lastRepTime.current > cooldown
      ) {
        footRising.current = false;
        lastRepTime.current = now;
        onRepDetectedRef.current?.();
      }
      footPrevSpeed.current = speed;
    }
    lastFootPos.current = { lx, ly, rx, ry, t: now };
  };

  const extractMetrics = (pose: poseDetection.Pose) => {
    if (!pose.keypoints) return;
    const kp = pose.keypoints;
    const visible = (i: number) => kp[i] && (kp[i].score ?? 0) > MIN_SCORE;

    // Knee angle (hip–knee–ankle) for each leg, only when all 3 joints are visible
    const kneeAngleFor = (hip: number, knee: number, ankle: number) =>
      visible(hip) && visible(knee) && visible(ankle)
        ? angleAt(kp[knee], kp[hip], kp[ankle])
        : null;
    const kneeAngleLeft = kneeAngleFor(KP.leftHip, KP.leftKnee, KP.leftAnkle);
    const kneeAngleRight = kneeAngleFor(KP.rightHip, KP.rightKnee, KP.rightAnkle);

    // Hip angle (shoulder–hip–knee): how upright the body is over the leg
    const hipAngleFor = (shoulder: number, hip: number, knee: number) =>
      visible(shoulder) && visible(hip) && visible(knee)
        ? angleAt(kp[hip], kp[shoulder], kp[knee])
        : null;
    const hipAngleLeft = hipAngleFor(KP.leftShoulder, KP.leftHip, KP.leftKnee);
    const hipAngleRight = hipAngleFor(KP.rightShoulder, KP.rightHip, KP.rightKnee);

    const avg = (a: number | null, b: number | null) =>
      a !== null && b !== null ? (a + b) / 2 : a ?? b;

    // Balance (0–1): level hips + upright torso
    let balanceScore: number | null = null;
    if (
      visible(KP.leftHip) && visible(KP.rightHip) &&
      visible(KP.leftShoulder) && visible(KP.rightShoulder)
    ) {
      const lHip = kp[KP.leftHip], rHip = kp[KP.rightHip];
      const hipWidth = Math.max(Math.abs(lHip.x - rHip.x), 1);
      const levelness = 1 - Math.min(Math.abs(lHip.y - rHip.y) / hipWidth, 1);

      const hipMidX = (lHip.x + rHip.x) / 2;
      const hipMidY = (lHip.y + rHip.y) / 2;
      const shoulderMidX = (kp[KP.leftShoulder].x + kp[KP.rightShoulder].x) / 2;
      const shoulderMidY = (kp[KP.leftShoulder].y + kp[KP.rightShoulder].y) / 2;
      const leanRad = Math.atan2(
        Math.abs(shoulderMidX - hipMidX),
        Math.abs(hipMidY - shoulderMidY)
      );
      const leanDeg = (leanRad * 180) / Math.PI;
      const uprightness = 1 - Math.min(leanDeg / 45, 1);

      balanceScore = (levelness + uprightness) / 2;
    }

    onPoseUpdate({
      kneeAngle: avg(kneeAngleLeft, kneeAngleRight),
      kneeAngleLeft,
      kneeAngleRight,
      hipAngle: avg(hipAngleLeft, hipAngleRight),
      balanceScore,
    });
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Camera Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {/* Camera loading — only shown before camera stream starts */}
      {!cameraReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-primary uppercase tracking-widest font-bold text-sm">Starting camera...</p>
        </div>
      )}

      {/* Small non-blocking AI badge — shows while models load in background */}
      {cameraReady && !aiReady && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold uppercase px-3 py-1.5 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
          AI loading...
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute w-full h-full object-cover transform -scale-x-100"
      />
      <canvas
        ref={canvasRef}
        className="absolute w-full h-full object-cover transform -scale-x-100 z-10"
      />

      {/* Clear "this is your live camera" badge */}
      {cameraReady && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full pointer-events-none">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Live · You
        </div>
      )}
    </div>
  );
}
