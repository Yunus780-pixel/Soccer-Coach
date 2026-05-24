import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Activity, Play, StopCircle, RefreshCw, XCircle, Users } from "lucide-react";
import { useGetDrill, useSubmitFeedback, useUpdateSession } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import PoseCamera from "@/components/pose-camera";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const SPECTATORS = [
  { id: 1, name: "Alex P.", initials: "AP" },
  { id: 2, name: "Jordan M.", initials: "JM" },
  { id: 3, name: "Coach Riley", initials: "CR" },
  { id: 4, name: "Sam T.", initials: "ST" },
];

export default function Train() {
  const [match, params] = useRoute("/train/:drillId");
  const drillId = params?.drillId ? parseInt(params.drillId, 10) : 0;
  
  // Parse sessionId from search string
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get("sessionId");

  const { data: drill, isLoading: isLoadingDrill } = useGetDrill(drillId, { 
    query: { enabled: !!drillId, queryKey: ['drill', drillId] as any } 
  });
  
  const submitFeedback = useSubmitFeedback();
  const updateSession = useUpdateSession();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [currentPoseMetrics, setCurrentPoseMetrics] = useState<any>(null);
  const [liveQuality, setLiveQuality] = useState<"Good" | "Needs Work" | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (drill && !isActive && timeLeft === 0 && !feedbackResult) {
      setTimeLeft(drill.durationSeconds);
    }
  }, [drill]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (isActive && timeLeft === 0) {
      handleStop();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const handleStart = () => {
    setIsActive(true);
    setRepCount(0);
    setFeedbackResult(null);
  };

  const handleStop = () => {
    setIsActive(false);
  };

  const handlePoseUpdate = useCallback((metrics: any) => {
    setCurrentPoseMetrics(metrics);
    if (isActive) {
      // Basic live quality indicator based on knee angle (simplistic example)
      if (metrics.kneeAngle && metrics.kneeAngle > 120 && metrics.kneeAngle < 160) {
        setLiveQuality("Good");
      } else {
        setLiveQuality("Needs Work");
      }
    }
  }, [isActive]);

  const handleRepDetected = useCallback(() => {
    setRepCount(c => c + 1);
  }, []);

  const handleManualRep = () => {
    if (isActive) {
      setRepCount(prev => prev + 1);
    }
  };

  const handleSubmitAnalysis = () => {
    if (!sessionId) {
      toast({ title: "Error", description: "No active session found.", variant: "destructive" });
      return;
    }

    const payload = {
      drillId,
      poseData: {
        kneeAngle: currentPoseMetrics?.kneeAngle || 140, // fallback if detection fails
        hipAngle: currentPoseMetrics?.hipAngle || 90,
        ankleFlexion: 45,
        legExtension: 80,
        balanceScore: 85
      },
      repCount
    };

    submitFeedback.mutate(
      { id: parseInt(sessionId, 10), data: payload },
      {
        onSuccess: (result) => {
          setFeedbackResult(result);

          // Read feedback aloud using Web Speech API
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const verdictText = result.verdict === "excellent"
              ? "Excellent work!"
              : result.verdict === "good"
              ? "Good job!"
              : result.verdict === "needs_work"
              ? "Keep working on it."
              : "Keep practising.";
            const intro = `AI analysis complete. Score: ${result.score} out of 100. ${verdictText}`;
            const tips = (result.tips ?? []).slice(0, 2).join(". ");
            const full = tips ? `${intro} Here are your coaching tips: ${tips}` : intro;
            const utterance = new SpeechSynthesisUtterance(full);
            utterance.rate = 0.95;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          }

          // Also update session as completed
          updateSession.mutate({
            id: parseInt(sessionId, 10),
            data: {
              status: "completed",
              score: result.score,
              repCount: repCount,
              feedbackSummary: result.verdict
            }
          });
        },
        onError: () => {
          toast({ title: "Analysis Failed", description: "Could not analyze pose data.", variant: "destructive" });
        }
      }
    );
  };

  if (!match) return null;

  return (
    <div className="w-full px-4 py-2">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-2 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-primary leading-tight">
            {drill?.name || "Loading..."}
          </h1>
          <p className="text-muted-foreground uppercase text-xs font-semibold tracking-wider">
            {drill?.category} • {drill?.difficulty}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-bold uppercase text-muted-foreground">Time</div>
            <div className={`text-3xl font-mono font-bold ${timeLeft <= 5 ? 'text-destructive' : 'text-primary'}`}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          </div>
          {!isActive && timeLeft === (drill?.durationSeconds || 0) && !feedbackResult && (
            <Button size="lg" className="uppercase font-bold" onClick={handleStart} data-testid="btn-start">
              <Play className="mr-2 w-5 h-5" /> Start Drill
            </Button>
          )}
          {isActive && (
            <Button size="lg" variant="destructive" className="uppercase font-bold" onClick={handleStop} data-testid="btn-stop">
              <StopCircle className="mr-2 w-5 h-5" /> Stop
            </Button>
          )}
          {!isActive && (feedbackResult || timeLeft < (drill?.durationSeconds || 0)) && (
            <Button size="lg" variant="outline" className="uppercase font-bold" onClick={() => {
               setTimeLeft(drill?.durationSeconds || 0);
               setFeedbackResult(null);
               setRepCount(0);
            }} data-testid="btn-reset">
              <RefreshCw className="mr-2 w-5 h-5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* FULL-WIDTH Camera */}
      <div className="relative bg-black rounded-xl overflow-hidden shadow-xl border-4 border-border max-w-7xl mx-auto" style={{ height: "75vh" }}>
        <PoseCamera isActive={isActive} onPoseUpdate={handlePoseUpdate} onRepDetected={handleRepDetected} />

        {/* Overlays */}
        <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-20">
          {isActive && (
            <div className="bg-red-600/90 text-white px-3 py-1 rounded-md text-sm font-bold uppercase tracking-wider flex items-center shadow-lg backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse mr-2" />
              Recording
            </div>
          )}
          {isActive && liveQuality && (
            <div className={`px-4 py-2 rounded-md text-white font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm transition-colors ${liveQuality === 'Good' ? 'bg-primary/90' : 'bg-destructive/90'}`}>
              Form: {liveQuality}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 pointer-events-none z-20">
          <motion.div
            key={repCount}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-black/60 text-white p-4 rounded-xl backdrop-blur-md border border-white/20"
          >
            <div className="text-xs font-bold uppercase tracking-widest text-white/70 mb-1">Reps</div>
            <div className="text-5xl font-bold font-mono">{repCount}</div>
          </motion.div>
        </div>

        {isActive && (
          <Button
            onClick={handleManualRep}
            className="absolute bottom-4 right-4 bg-primary hover:bg-primary/90 text-white shadow-xl opacity-60 hover:opacity-100 z-20"
            size="lg"
          >
            +1 Rep (Manual)
          </Button>
        )}
      </div>

      {/* Bottom strip: spectators + drill info + actions */}
      <div className="max-w-7xl mx-auto mt-3 flex flex-col gap-3">

        {/* Spectator row */}
        <div className="bg-muted/30 border rounded-lg px-3 py-1.5 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
            <Users className="w-3 h-3 mr-1" /> Watching
          </div>
          {SPECTATORS.map(spec => (
            <div key={spec.id} className="flex items-center bg-white border shadow-sm rounded-full px-2 py-0.5 shrink-0 gap-1.5">
              <Avatar className="w-6 h-6 border border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">{spec.initials}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-bold whitespace-nowrap">{spec.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
            </div>
          ))}
        </div>

        {/* Feedback result or key points */}
        {feedbackResult ? (
          <Card className="border-primary shadow-md overflow-hidden bg-primary/5">
            <div className="bg-primary p-4 text-primary-foreground flex items-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-bold font-mono">{feedbackResult.score}<span className="text-2xl text-primary-foreground/70">/100</span></div>
                <Badge variant="secondary" className="uppercase font-bold text-primary bg-white mt-1">{feedbackResult.verdict}</Badge>
              </div>
              <div className="flex gap-6 text-sm flex-wrap">
                <div><span className="text-primary-foreground/70 uppercase text-xs font-bold block">Knee</span><span className="font-bold capitalize">{feedbackResult.poseQuality?.kneeAlignment}</span></div>
                <div><span className="text-primary-foreground/70 uppercase text-xs font-bold block">Hip</span><span className="font-bold capitalize">{feedbackResult.poseQuality?.hipStability}</span></div>
                <div><span className="text-primary-foreground/70 uppercase text-xs font-bold block">Foot</span><span className="font-bold capitalize">{feedbackResult.poseQuality?.footContact}</span></div>
                <div className="flex-1">
                  {feedbackResult.tips?.slice(0, 2).map((tip: string, i: number) => (
                    <div key={i} className="flex items-start gap-1 text-primary-foreground/90 text-xs mb-1">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />{tip}
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="secondary" className="ml-auto uppercase font-bold shrink-0" onClick={() => setLocation("/")}>Finish</Button>
            </div>
          </Card>
        ) : (
          <div className="flex gap-3 items-start flex-wrap">
            <div className="flex-1 min-w-0 flex gap-2 flex-wrap">
              {drill?.keyPoints?.slice(0, 3).map((point, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted/50 border rounded-lg px-3 py-1.5 text-xs font-medium">
                  <span className="text-primary font-bold">{i+1}.</span> {point}
                </div>
              ))}
            </div>
            {!isActive && timeLeft < (drill?.durationSeconds || 0) && (
              <Button
                size="lg"
                className="uppercase font-bold shrink-0"
                onClick={handleSubmitAnalysis}
                disabled={submitFeedback.isPending}
                data-testid="btn-submit-form"
              >
                {submitFeedback.isPending ? "Analyzing..." : "Get AI Feedback"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}