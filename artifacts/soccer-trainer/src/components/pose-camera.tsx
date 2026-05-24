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
}

async function initBackend() {
  for (const backend of ["webgl", "cpu"] as const) {
    try {
      const ok = await tf.setBackend(backend);
      if (ok) { await tf.ready(); return; }
    } catch (_) { /* try next */ }
  }
  throw new Error("No TF backend available");
}

export default function PoseCamera({ isActive, onPoseUpdate, onRepDetected }: PoseCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseDetector, setPoseDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [ballDetector, setBallDetector] = useState<cocoSsd.ObjectDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const animationFrameId = useRef<number | null>(null);

  const lastBallPos = useRef<{ x: number; y: number } | null>(null);
  const lastRepTime = useRef<number>(0);
  const onRepDetectedRef = useRef(onRepDetected);
  onRepDetectedRef.current = onRepDetected;

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

  // Detection loop
  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    async function detect() {
      if (video.readyState < 2) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Pose estimation
      if (poseDetector) {
        try {
          const poses = await poseDetector.estimatePoses(video);
          if (poses.length > 0) extractMetrics(poses[0]);
        } catch (_) {}
      }

      // Ball detection
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

            // Rep counting — detect kick via fast ball movement
            const now = Date.now();
            if (lastBallPos.current) {
              const dx = cx - lastBallPos.current.x;
              const dy = cy - lastBallPos.current.y;
              const speed = Math.sqrt(dx * dx + dy * dy);
              if (speed > 30 && now - lastRepTime.current > 1200) {
                lastRepTime.current = now;
                onRepDetectedRef.current?.();
                // Flash ring on kick
                ctx.beginPath();
                ctx.arc(cx, cy, r + 20, 0, 2 * Math.PI);
                ctx.strokeStyle = "rgba(22, 163, 74, 0.8)";
                ctx.lineWidth = 5;
                ctx.stroke();
              }
            }
            lastBallPos.current = { x: cx, y: cy };
          } else {
            lastBallPos.current = null;
          }
        } catch (_) {}
      }

      animationFrameId.current = requestAnimationFrame(detect);
    }

    animationFrameId.current = requestAnimationFrame(detect);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isActive, poseDetector, ballDetector]);

  const extractMetrics = (pose: poseDetection.Pose) => {
    if (!pose.keypoints) return;
    const hip = pose.keypoints[12];
    const knee = pose.keypoints[14];
    const ankle = pose.keypoints[16];
    let kneeAngle = null;
    if (hip.score! > 0.3 && knee.score! > 0.3 && ankle.score! > 0.3) {
      const dx1 = hip.x - knee.x;
      const dy1 = hip.y - knee.y;
      const dx2 = ankle.x - knee.x;
      const dy2 = ankle.y - knee.y;
      const angle = Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1);
      let kneeAngleDeg = Math.abs((angle * 180) / Math.PI);
      if (kneeAngleDeg > 180) kneeAngleDeg = 360 - kneeAngleDeg;
      kneeAngle = kneeAngleDeg;
    }
    onPoseUpdate({ kneeAngle, hipAngle: 90 });
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
    </div>
  );
}
