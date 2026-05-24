import { Link, useLocation } from "wouter";
import { Activity, Trophy, LayoutDashboard } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Training", icon: Activity },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/stats", label: "Stats", icon: LayoutDashboard },
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
                FootWork<span className="text-primary">AI</span>
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