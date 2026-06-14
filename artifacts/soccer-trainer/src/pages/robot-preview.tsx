// DEV-ONLY full-screen preview of the Robo-Coach, used to screenshot the 3D
// scene headlessly while iterating. Not part of the shipped app (the route is
// gated behind import.meta.env.DEV in App.tsx). Query params:
//   ?drill=power%20strike%20form   pick the drill by name
//   ?category=shooting             or by category
import HumanCoach3D from "@/components/robot-coach/human-coach-3d";

export default function RobotPreview() {
  const params = new URLSearchParams(window.location.search);
  const drill = params.get("drill") ?? "toe taps";
  const category = params.get("category");
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9999 }}>
      <HumanCoach3D drillName={drill} category={category} />
    </div>
  );
}
