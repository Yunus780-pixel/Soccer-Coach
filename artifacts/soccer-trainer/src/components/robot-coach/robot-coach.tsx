// COACH entry point.
//
// Renders the realistic 3D human coach (human-coach-3d.tsx) — a Mixamo-rigged
// glTF driven by the drill choreography via IK. It's code-split so three.js +
// the model only load when the coach is actually shown. While that chunk loads
// — and on any device where WebGL/three fails — it falls back to the original
// 2D SVG robot (robot-coach-2d.tsx), so the demo always shows *something*.
import { Component, Suspense, lazy, type ReactNode } from "react";
import RobotCoach2D from "./robot-coach-2d";

const Coach3D = lazy(() => import("./human-coach-3d"));

interface RobotCoachProps {
  drillName?: string | null;
  category?: string | null;
  /** Compact mode (picture-in-picture): hides the knee meter */
  compact?: boolean;
  className?: string;
}

/** Falls back to the 2D robot if the 3D scene throws (e.g. no WebGL). */
class WebGLBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function RobotCoach(props: RobotCoachProps) {
  const fallback = <RobotCoach2D {...props} />;
  return (
    <WebGLBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Coach3D {...props} />
      </Suspense>
    </WebGLBoundary>
  );
}
