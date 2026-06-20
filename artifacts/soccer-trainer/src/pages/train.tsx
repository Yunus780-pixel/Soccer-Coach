import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Activity, Play, StopCircle, RefreshCw, Trophy, User, Eye, EyeOff } from "lucide-react";
import { useGetDrill, useSubmitFeedback, useListSessions } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import PoseCamera from "@/components/pose-camera";
import CoachDemo from "@/components/robot-coach/coach-demo";

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
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [liveQuality, setLiveQuality] = useState<"Good" | "Needs Work" | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<any>(null);
  const [showRobot, setShowRobot] = useState(true);

  // Real end time of the drill — the countdown follows the actual clock, so
  // it stays correct even if the browser tab is hidden for a while.
  const endAtRef = useRef<number | null>(null);
  // Guards the one-time automatic scoring when the drill timer runs out.
  const autoSubmittedRef = useRef(false);

  // Running totals of real measurements across the whole drill,
  // so the final score reflects the full session — not just one frame.
  const metricsAccumRef = useRef({
    knee: { sum: 0, n: 0 },
    hip: { sum: 0, n: 0 },
    balance: { sum: 0, n: 0 },
  });

  // Personal best for this player + drill from earlier completed sessions
  const playerName = localStorage.getItem("footwork_player_name") ?? "";
  const { data: allSessions } = useListSessions();
  const personalBest = (allSessions ?? [])
    .filter(
      (s) =>
        s.drillId === drillId &&
        s.playerName === playerName &&
        s.status === "completed" &&
        s.score !== null &&
        (!sessionId || s.id !== parseInt(sessionId, 10))
    )
    .reduce<number | null>(
      (best, s) => (best === null || (s.score ?? 0) > best ? s.score ?? best : best),
      null
    );
  const isNewBest =
    feedbackResult != null &&
    (personalBest === null || feedbackResult.score > personalBest);

  // Cheerful beep every time a rep counts
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playRepSound = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch (_) {
      // Sound is a bonus — never break the drill over it
    }
  }, []);

  useEffect(() => {
    if (drill && !isActive && timeLeft === 0 && !feedbackResult) {
      setTimeLeft(drill.durationSeconds);
    }
  }, [drill]);

  // Stop the coach voice if you leave the page mid-sentence
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      if (endAtRef.current === null) return;
      const remaining = Math.max(
        0,
        Math.ceil((endAtRef.current - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining === 0) setIsActive(false);
    }, 250);
    return () => clearInterval(interval);
  }, [isActive]);

  const handleStart = () => {
    endAtRef.current = Date.now() + (drill?.durationSeconds ?? 0) * 1000;
    autoSubmittedRef.current = false;
    setIsActive(true);
    setRepCount(0);
    setFeedbackResult(null);
    metricsAccumRef.current = {
      knee: { sum: 0, n: 0 },
      hip: { sum: 0, n: 0 },
      balance: { sum: 0, n: 0 },
    };
  };

  const handleStop = () => {
    setIsActive(false);
  };

  const handlePoseUpdate = useCallback((metrics: any) => {
    if (!isActive) return;

    const acc = metricsAccumRef.current;
    if (typeof metrics.kneeAngle === "number") {
      acc.knee.sum += metrics.kneeAngle;
      acc.knee.n++;
      setLiveQuality(
        metrics.kneeAngle > 120 && metrics.kneeAngle < 160 ? "Good" : "Needs Work"
      );
    }
    if (typeof metrics.hipAngle === "number") {
      acc.hip.sum += metrics.hipAngle;
      acc.hip.n++;
    }
    if (typeof metrics.balanceScore === "number") {
      acc.balance.sum += metrics.balanceScore;
      acc.balance.n++;
    }
  }, [isActive]);

  const handleRepDetected = useCallback(() => {
    setRepCount(c => c + 1);
    playRepSound();
  }, [playRepSound]);

  const handleManualRep = () => {
    if (isActive) {
      setRepCount(prev => prev + 1);
      playRepSound();
    }
  };

  const handleSubmitAnalysis = () => {
    if (!sessionId) {
      toast({ title: "Error", description: "No active session found.", variant: "destructive" });
      return;
    }

    // Send only what the camera really measured — averaged over the whole
    // drill. Anything we couldn't see is sent as null, never invented.
    const acc = metricsAccumRef.current;
    const avgOf = (s: { sum: number; n: number }) =>
      s.n > 0 ? s.sum / s.n : null;

    const payload = {
      drillId,
      poseData: {
        kneeAngle: avgOf(acc.knee),
        hipAngle: avgOf(acc.hip),
        balanceScore: avgOf(acc.balance),
        ankleFlexion: null,
        legExtension: null,
      },
      repCount
    };

    submitFeedback.mutate(
      { id: parseInt(sessionId, 10), data: payload },
      {
        onSuccess: (result) => {
          setFeedbackResult(result);

          // Read the real result aloud using the Web Speech API
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const great = result.verdict === "excellent" || result.verdict === "good";
            const formText = great ? "Your form is great!" : "Your form needs improvement.";
            const intro = `Drill complete. You scored ${result.score} out of 100. ${formText}`;
            const tips = (result.tips ?? []).slice(0, 2).join(". ");
            const full = tips ? `${intro} ${tips}` : intro;
            const utterance = new SpeechSynthesisUtterance(full);
            utterance.rate = 0.95;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          }
          // (The server already saved the session as completed with the
          // score, summary and reps — no second save needed.)
        },
        onError: () => {
          toast({ title: "Analysis Failed", description: "Could not analyze pose data.", variant: "destructive" });
        }
      }
    );
  };

  // When the drill timer runs out, automatically score it and announce the
  // result — no need to press a button.
  useEffect(() => {
    if (
      !isActive &&
      timeLeft === 0 &&
      sessionId &&
      !feedbackResult &&
      !autoSubmittedRef.current &&
      !submitFeedback.isPending
    ) {
      autoSubmittedRef.current = true;
      handleSubmitAnalysis();
    }
  }, [isActive, timeLeft, sessionId, feedbackResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verdict helpers for the on-screen result.
  const fbGreat = feedbackResult?.verdict === "excellent" || feedbackResult?.verdict === "good";
  const fbUnmeasured =
    feedbackResult?.poseQuality?.kneeAlignment === "not measured" &&
    feedbackResult?.poseQuality?.hipStability === "not measured";

  if (!match) return null;

  return (
    <div className="w-full px-4 py-2">
      {/* Session name banner */}
      <div className="max-w-7xl mx-auto mb-2 bg-primary rounded-xl px-5 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-white shrink-0" />
          <div>
            <div className="text-white/70 uppercase text-[10px] font-bold tracking-widest leading-none mb-0.5">Now Training</div>
            <h1 className="text-white text-xl font-bold uppercase tracking-tight leading-tight">
              {drill?.name || "Loading..."}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="bg-white/20 text-white text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md">
            {drill?.category}
          </span>
          <span className="bg-white/20 text-white text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md">
            {drill?.difficulty}
          </span>
        </div>
      </div>

      {/* Top bar */}
      <div className="flex justify-between items-center mb-2 max-w-7xl mx-auto">
        <div />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-bold uppercase text-muted-foreground">Time</div>
            <div className={`text-3xl font-mono font-bold ${timeLeft <= 5 ? 'text-destructive' : 'text-primary'}`}>
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
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
        <PoseCamera isActive={isActive} onPoseUpdate={handlePoseUpdate} onRepDetected={handleRepDetected} drillCategory={drill?.category} />

        {/* ROBO-COACH demo — shows you the moves while you train */}
        {showRobot && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-16 right-4 z-30 w-[280px] max-w-[42vw] rounded-xl overflow-hidden shadow-2xl border-2 border-primary/70"
          >
            <div className="bg-primary text-white px-3 py-1.5 flex items-center gap-1.5">
              <User className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider leading-none">
                Watch the Coach
              </span>
            </div>
            <div className="bg-black aspect-[4/3]">
              <CoachDemo drillName={drill?.name} category={drill?.category} />
            </div>
          </motion.div>
        )}

        {/* Toggle robot on/off */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowRobot((v) => !v)}
          className="absolute top-4 right-4 z-30 opacity-80 hover:opacity-100 uppercase text-xs font-bold gap-1.5"
          data-testid="btn-toggle-robot"
        >
          {showRobot ? <EyeOff className="w-4 h-4" /> : <User className="w-4 h-4" />}
          {showRobot ? "Hide Coach" : "Show Coach"}
        </Button>

        {/* Overlays — kept on the LEFT so the robot panel owns the right side */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-20">
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

        {/* Big, automatic result card — appears the moment the drill ends */}
        <AnimatePresence>
          {feedbackResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.85, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.35 }}
                className="bg-card text-card-foreground rounded-2xl shadow-2xl border-2 border-primary/40 p-6 sm:p-8 w-full max-w-md text-center"
              >
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Your Score</div>
                <div className="text-7xl font-extrabold font-mono text-primary leading-none">
                  {feedbackResult.score}<span className="text-3xl text-muted-foreground">/100</span>
                </div>
                <div
                  className={`mt-4 inline-block px-4 py-2 rounded-lg text-lg font-extrabold uppercase tracking-wide ${
                    fbUnmeasured
                      ? "bg-amber-100 text-amber-800"
                      : fbGreat
                      ? "bg-primary/15 text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                  data-testid="form-verdict"
                >
                  {fbUnmeasured ? "⚠️ Couldn't see your form" : fbGreat ? "💪 Form is great!" : "🛠️ Form needs improvement"}
                </div>
                {isNewBest && !fbUnmeasured && (
                  <div className="mt-2 text-yellow-600 font-bold text-sm uppercase tracking-wider">🎉 New Personal Best!</div>
                )}
                <ul className="mt-4 text-left space-y-2">
                  {(feedbackResult.tips ?? []).slice(0, 3).map((tip: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/50 rounded-md py-1.5"><div className="text-muted-foreground uppercase font-bold">Knee</div><div className="font-semibold capitalize">{feedbackResult.poseQuality?.kneeAlignment}</div></div>
                  <div className="bg-muted/50 rounded-md py-1.5"><div className="text-muted-foreground uppercase font-bold">Hip</div><div className="font-semibold capitalize">{feedbackResult.poseQuality?.hipStability}</div></div>
                  <div className="bg-muted/50 rounded-md py-1.5"><div className="text-muted-foreground uppercase font-bold">Reps</div><div className="font-semibold">{repCount}</div></div>
                </div>
                <div className="mt-5 flex gap-2 justify-center">
                  <Button variant="outline" className="uppercase font-bold" onClick={() => {
                    setTimeLeft(drill?.durationSeconds || 0);
                    setFeedbackResult(null);
                    setRepCount(0);
                    autoSubmittedRef.current = false;
                  }}>
                    <RefreshCw className="mr-2 w-4 h-4" /> Try Again
                  </Button>
                  <Button className="uppercase font-bold" onClick={() => setLocation("/")}>Finish</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom strip: personal best + drill info + actions */}
      <div className="max-w-7xl mx-auto mt-3 flex flex-col gap-3">

        {/* Personal best row */}
        <div className="bg-muted/30 border rounded-lg px-3 py-1.5 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
            <Trophy className="w-3 h-3 mr-1" /> Personal Best
          </div>
          {personalBest !== null ? (
            <span className="text-sm font-bold" data-testid="text-personal-best">
              {personalBest}/100 <span className="font-medium text-muted-foreground">— beat it today!</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground" data-testid="text-personal-best">
              No score for this drill yet — today you set the first record! 🚀
            </span>
          )}
        </div>

        {/* Feedback result or key points */}
        {feedbackResult ? (
          <Card className="border-primary shadow-md overflow-hidden bg-primary/5">
            <div className="bg-primary p-4 text-primary-foreground flex items-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-bold font-mono">{feedbackResult.score}<span className="text-2xl text-primary-foreground/70">/100</span></div>
                <Badge variant="secondary" className="uppercase font-bold text-primary bg-white mt-1">{feedbackResult.verdict}</Badge>
                {isNewBest && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.6 }}
                    className="mt-2 bg-yellow-400 text-yellow-950 text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow"
                    data-testid="badge-new-best"
                  >
                    🎉 New Personal Best!
                  </motion.div>
                )}
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