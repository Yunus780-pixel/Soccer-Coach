import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface PoseCameraProps {
  isActive: boolean;
  onPoseUpdate: (metrics: any) => void;
}

export default function PoseCamera({ isActive, onPoseUpdate }: PoseCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const animationFrameId = useRef<number | null>(null);

  // Load Model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsModelLoading(true);
        await tf.ready();
        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
        const newDetector = await poseDetection.createDetector(model, detectorConfig);
        setDetector(newDetector);
      } catch (err) {
        console.error("Failed to load MoveNet model", err);
        setError("Failed to load AI pose detection model. Please refresh.");
      } finally {
        setIsModelLoading(false);
      }
    }
    loadModel();
  }, []);

  // Setup Camera
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
      // Cleanup stream on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Prediction Loop
  useEffect(() => {
    if (!isActive || !detector || !videoRef.current || !canvasRef.current) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    async function detectPose() {
      if (video.readyState < 2) {
        animationFrameId.current = requestAnimationFrame(detectPose);
        return;
      }

      // Match canvas to video dimensions
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        const poses = await detector!.estimatePoses(video);
        
        ctx!.clearRect(0, 0, canvas.width, canvas.height);

        if (poses && poses.length > 0) {
          const pose = poses[0];
          drawSkeleton(pose, ctx!);
          extractMetrics(pose);
        }
      } catch (e) {
        console.error(e);
      }

      animationFrameId.current = requestAnimationFrame(detectPose);
    }

    animationFrameId.current = requestAnimationFrame(detectPose);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isActive, detector]);

  const drawSkeleton = (pose: poseDetection.Pose, ctx: CanvasRenderingContext2D) => {
    if (!pose.keypoints) return;
    
    const keypoints = pose.keypoints;
    const minConfidence = 0.3;

    // Draw keypoints (focus on legs for soccer)
    const legIndices = [11, 12, 13, 14, 15, 16]; // hips, knees, ankles
    
    keypoints.forEach((kp, i) => {
      if (kp.score && kp.score > minConfidence) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, legIndices.includes(i) ? 6 : 4, 0, 2 * Math.PI);
        ctx.fillStyle = legIndices.includes(i) ? "#16a34a" : "rgba(255, 255, 255, 0.5)"; // Primary green for legs
        ctx.fill();
      }
    });

    // Draw connections
    const adjacentKeyPoints = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);
    ctx.lineWidth = 3;
    
    adjacentKeyPoints.forEach((pair) => {
      const p1 = keypoints[pair[0]];
      const p2 = keypoints[pair[1]];

      if (p1.score && p1.score > minConfidence && p2.score && p2.score > minConfidence) {
        // Highlight leg connections
        const isLeg = legIndices.includes(pair[0]) || legIndices.includes(pair[1]);
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isLeg ? "#16a34a" : "rgba(255, 255, 255, 0.3)";
        ctx.stroke();
      }
    });
  };

  const extractMetrics = (pose: poseDetection.Pose) => {
    if (!pose.keypoints) return;
    
    // Very simplified angle calculation for demonstration
    // Find right hip(12), right knee(14), right ankle(16)
    const hip = pose.keypoints[12];
    const knee = pose.keypoints[14];
    const ankle = pose.keypoints[16];

    let kneeAngle = null;
    let hipAngle = null;

    if (hip.score! > 0.3 && knee.score! > 0.3 && ankle.score! > 0.3) {
      // Calc angle
      const dx1 = hip.x - knee.x;
      const dy1 = hip.y - knee.y;
      const dx2 = ankle.x - knee.x;
      const dy2 = ankle.y - knee.y;
      
      const angle = Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1);
      kneeAngle = Math.abs((angle * 180) / Math.PI);
      if (kneeAngle > 180) kneeAngle = 360 - kneeAngle;
    }

    onPoseUpdate({
      kneeAngle,
      hipAngle: 90 // placeholder
    });
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
          <p className="text-primary uppercase tracking-widest font-bold animate-pulse">Loading AI Model...</p>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute w-full h-full object-cover transform -scale-x-100" // mirror image
      />
      <canvas
        ref={canvasRef}
        className="absolute w-full h-full object-cover transform -scale-x-100 z-10" // match video mirroring
      />
    </div>
  );
}