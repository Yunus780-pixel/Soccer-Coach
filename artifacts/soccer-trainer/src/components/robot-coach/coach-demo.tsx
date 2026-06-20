// COACH DEMO — what the train page shows by default.
//
// Plays a pre-rendered video of the 3D coach doing the drill, with Front / Side
// / Back tabs so the player can study the move from any angle. The videos are
// rendered offline (tools/coach-render) so they always play instantly on any
// device — no WebGL, no model download. An "Interactive" toggle swaps in the
// live 3D coach for anyone who wants to orbit it in real time.
import { lazy, Suspense, useMemo, useState } from "react";
import { Box, Video as VideoIcon } from "lucide-react";
import { getMotionForDrill } from "./motions";
import type { ViewAngle } from "./human-coach-3d";

const RobotCoach = lazy(() => import("./robot-coach"));

interface CoachDemoProps {
  drillName?: string | null;
  category?: string | null;
  compact?: boolean;
  className?: string;
}

const ANGLES: { key: ViewAngle; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

/** "Power Strike Form" → "power-strike-form" (matches the rendered file names). */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Drills that currently have rendered videos. As we render more, add their
// slugs here (the render tool writes <slug>-<angle>.mp4 into public/videos).
const VIDEO_DRILLS = new Set(["toe-taps", "power-strike-form", "juggling-starter"]);

export function hasCoachVideo(drillName?: string | null): boolean {
  return !!drillName && VIDEO_DRILLS.has(slugify(drillName));
}

export default function CoachDemo({ drillName, category, compact = false, className }: CoachDemoProps) {
  const slug = drillName ? slugify(drillName) : "";
  const hasVideo = VIDEO_DRILLS.has(slug);
  const motion = useMemo(() => getMotionForDrill(drillName, category), [drillName, category]);
  const defaultAngle: ViewAngle = motion.view === "side" ? "side" : "front";

  const [angle, setAngle] = useState<ViewAngle>(defaultAngle);
  const [interactive, setInteractive] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);

  const base = import.meta.env.BASE_URL;

  // Live 3D coach — either chosen via the toggle, or as a fallback when there's
  // no video for this drill / the video fails to load.
  const live = (
    <Suspense fallback={<div className="w-full h-full bg-black" />}>
      <RobotCoach drillName={drillName} category={category} compact={compact} className={className} />
    </Suspense>
  );

  if (!hasVideo || videoBroken) return <div className={className} style={{ width: "100%", height: "100%" }}>{live}</div>;
  if (interactive) {
    return (
      <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
        {live}
        <button
          onClick={() => setInteractive(false)}
          className="absolute top-2 right-2 z-30 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-black/80"
        >
          <VideoIcon className="w-3 h-3" /> Video
        </button>
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        key={`${slug}-${angle}`}
        src={`${base}videos/${slug}-${angle}.mp4`}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setVideoBroken(true)}
        className="w-full h-full object-cover bg-black"
      />

      {/* Angle tabs */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur-sm">
        {ANGLES.map((a) => (
          <button
            key={a.key}
            onClick={() => setAngle(a.key)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              angle === a.key ? "bg-primary text-white" : "text-white/70 hover:text-white"
            }`}
            data-testid={`btn-angle-${a.key}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Interactive (live 3D) toggle */}
      <button
        onClick={() => setInteractive(true)}
        className="absolute top-2 right-2 z-30 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-black/80"
        data-testid="btn-interactive-3d"
      >
        <Box className="w-3 h-3" /> 3D
      </button>
    </div>
  );
}
