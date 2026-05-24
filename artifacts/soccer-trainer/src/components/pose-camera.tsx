import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface PoseCameraProps {
  isActive: boolean;
  onPoseUpdate: (metrics: any) => void;
  onRepDetected?: () => void;
}

export default function PoseCamera({ isActive, onPoseUpdate, onRepDetected }: PoseCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseDetector, setPoseDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [ballDetector, setBallDetector] = useState<cocoSsd.ObjectDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const animationFrameId = useRef<number | null>(null);

  // Ball tracking refs (no re-render needed)
  const lastBallPos = useRef<{ x: number; y: number } | null>(null);
  const lastRepTime = useRef<number>(0);
  const onRepDetectedRef = useRef(onRepDetected);
  onRepDetectedRef.current = onRepDetected;

  // Load models
  useEffect(() => {
    async function loadModels() {
      try {
        setIsModelLoading(true);
        await tf.ready();

        const [newPoseDetector, newBallDetector] = await Promise.all([
          poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
          ),
          cocoSsd.load({ base: "lite_mobilenet_v2" }),
        ]);

        setPoseDetector(newPoseDetector);
        setBallDetector(newBallDetector);
      } catch (err) {
        console.error("Failed to load models", err);
        setError("Failed to load AI model. Please refresh.");
      } finally {
        setIsModelLoading(false);
      }
    }
    loadModels();
  }, []);

  // Setup camera
  useEffect(() => {
    async function setupCamera() {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" }
        });
        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera access denied", err);
        setError("Camera access is required for real-time analysis. Please allow camera permissions.");
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Detection loop
  useEffect(() => {
    if (!isActive || !poseDetector || !ballDetector || !videoRef.current || !canvasRef.current) {
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

      try {
        // Run both models in parallel
        const [poses, objects] = await Promise.all([
          poseDetector!.estimatePoses(video),
          ballDetector!.detect(video),
        ]);

        // Pose metrics
        if (poses.length > 0) {
          extractMetrics(poses[0]);
        }

        // Ball detection
        const ball = objects.find(o => o.class === "sports ball" && o.score > 0.4);

        if (ball) {
          const cx = ball.bbox[0] + ball.bbox[2] / 2;
          const cy = ball.bbox[1] + ball.bbox[3] / 2;
          const r = Math.max(ball.bbox[2], ball.bbox[3]) / 2;

          // Draw ball highlight on canvas
          ctx.beginPath();
          ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI);
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "#16a34a";
          ctx.fill();

          // Rep counting: detect a kick by measuring ball displacement
          const now = Date.now();
          if (lastBallPos.current) {
            const dx = cx - lastBallPos.current.x;
            const dy = cy - lastBallPos.current.y;
            const speed = Math.sqrt(dx * dx + dy * dy);

            // If ball moved > 40px in one frame and debounce passed → rep
            if (speed > 40 && now - lastRepTime.current > 1500) {
              lastRepTime.current = now;
              onRepDetectedRef.current?.();

              // Flash ring on kick
              ctx.beginPath();
              ctx.arc(cx, cy, r + 18, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(22, 163, 74, 0.7)";
              ctx.lineWidth = 5;
              ctx.stroke();
            }
          }

          lastBallPos.current = { x: cx, y: cy };
        } else {
          lastBallPos.current = null;
        }
      } catch (e) {
        console.error(e);
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
      kneeAngle = Math.abs((angle * 180) / Math.PI);
      if (kneeAngle > 180) kneeAngle = 360 - kneeAngle;
    }
    onPoseUpdate({ kneeAngle, hipAngle: 90 });
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-muted overflow-hidden flex items-center justify-center">
      {isModelLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background/80 backdrop-blur-sm">
          <Skeleton className="w-32 h-32 rounded-full mb-4 opacity-50" />
          <p className="text-primary uppercase tracking-widest font-bold animate-pulse">Loading AI Models...</p>
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
