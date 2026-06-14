import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import Home from "@/pages/home";
import Train from "@/pages/train";
import Leaderboard from "@/pages/leaderboard";
import Stats from "@/pages/stats";
import Sessions from "@/pages/sessions";

// Admin-only dashboard — lazy so its charting library stays out of the main bundle.
const Monitor = lazy(() => import("@/pages/monitor"));

const queryClient = new QueryClient();

// Dev-only: full-screen 3D Robo-Coach preview for headless screenshots.
// Lazily imported and gated on DEV so it is tree-shaken out of production.
const RobotPreview = import.meta.env.DEV
  ? lazy(() => import("@/pages/robot-preview"))
  : null;

function Router() {
  if (RobotPreview && window.location.pathname.endsWith("/__preview")) {
    return (
      <Suspense fallback={null}>
        <RobotPreview />
      </Suspense>
    );
  }
  return (
    <Layout>
      <Suspense fallback={null}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/train/:drillId" component={Train} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/stats" component={Stats} />
          <Route path="/sessions" component={Sessions} />
          <Route path="/monitor" component={Monitor} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
