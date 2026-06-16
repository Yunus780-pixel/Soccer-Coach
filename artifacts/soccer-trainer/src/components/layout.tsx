import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Trophy, LayoutDashboard, History, Radar } from "lucide-react";
import { startHeartbeat, setActivity } from "@/lib/presence";
import { isMonitorUnlocked } from "@/lib/monitor-access";

interface LayoutProps {
  children: React.ReactNode;
}

// What to report as the current activity for each route. The train page sets a
// more specific label (the drill name), so we leave "/train" out here.
function activityForPath(path: string): string | null {
  if (path === "/") return "Choosing a drill";
  if (path.startsWith("/train")) return null; // train page reports the drill
  if (path.startsWith("/sessions")) return "Viewing sessions";
  if (path.startsWith("/leaderboard")) return "Leaderboard";
  if (path.startsWith("/stats")) return "Stats";
  if (path.startsWith("/monitor")) return "Monitoring";
  return "Browsing";
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  useEffect(() => startHeartbeat(), []);
  useEffect(() => {
    const label = activityForPath(location);
    if (label) setActivity(label);
  }, [location]);

  const navItems = [
    { href: "/", label: "Training", icon: Activity },
    { href: "/sessions", label: "Sessions", icon: History },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/stats", label: "Stats", icon: LayoutDashboard },
    // Private: only appears on devices that have unlocked it with the code.
    ...(isMonitorUnlocked() ? [{ href: "/monitor", label: "Monitor", icon: Radar }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-md group-hover:scale-105 transition-transform">
                <Activity className="w-6 h-6" />
              </div>
              <span className="font-serif text-2xl font-bold uppercase tracking-wider text-foreground">
                PAN<span className="text-primary">NA</span>
              </span>
            </div>
          </Link>
          
          <nav className="flex items-center gap-1 md:gap-6 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`
                    flex items-center gap-2 px-3 py-2 rounded-md text-sm font-bold uppercase tracking-wider cursor-pointer transition-colors
                    ${isActive 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}>
                    <Icon className="w-4 h-4 hidden sm:block" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}