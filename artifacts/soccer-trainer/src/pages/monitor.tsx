// MONITOR: see who's using PANNA right now and how usage trends over time.
// Open page (no login) at /monitor. Times shown in YOUR local timezone.
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Circle } from "lucide-react";

interface LiveUser {
  name: string;
  drill: string;
  secondsAgo: number;
}
interface LiveData {
  count: number;
  users: LiveUser[];
}
interface DayRow {
  day: string;
  visitors: number;
  sessions: number;
}

function ago(seconds: number): string {
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export default function Monitor() {
  const [live, setLive] = useState<LiveData>({ count: 0, users: [] });
  const [history, setHistory] = useState<DayRow[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    const pollLive = () =>
      fetch("/api/monitor/live")
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          setLive(d);
          setUpdated(new Date());
          setOffline(false);
        })
        .catch(() => active && setOffline(true));
    const pollHistory = () =>
      fetch("/api/monitor/history?days=14")
        .then((r) => r.json())
        .then((d) => active && setHistory(d.days ?? []))
        .catch(() => {});

    pollLive();
    pollHistory();
    const a = window.setInterval(pollLive, 5000);
    const b = window.setInterval(pollHistory, 30000);
    return () => {
      active = false;
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, []);

  const totalVisitors = history.reduce((s, d) => s + d.visitors, 0);
  const totalSessions = history.reduce((s, d) => s + d.sessions, 0);
  const chartData = history.map((d) => ({
    day: d.day.slice(5), // MM-DD
    People: d.visitors,
    Sessions: d.sessions,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-tight text-primary">Live Monitor</h1>
          <p className="text-muted-foreground mt-1">Who's training right now, and usage over time.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {offline ? (
            <span className="text-destructive font-semibold">Can't reach the server</span>
          ) : updated ? (
            <>Updated {updated.toLocaleTimeString()} (your time)</>
          ) : (
            "Loading…"
          )}
        </div>
      </header>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Circle className="w-3 h-3 fill-primary text-primary animate-pulse" /> Online now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold text-primary tabular-nums">{live.count}</div>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> People (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold tabular-nums">{totalVisitors}</div>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Sessions (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold tabular-nums">{totalSessions}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live list */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-lg">Right now</CardTitle>
          </CardHeader>
          <CardContent>
            {live.users.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">Nobody's online at the moment.</p>
            ) : (
              <ul className="divide-y">
                {live.users.map((u, i) => (
                  <li key={i} className="flex items-center justify-between py-3" data-testid="live-user">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <div className="font-semibold uppercase tracking-wide truncate">{u.name}</div>
                        <div className="text-sm text-muted-foreground truncate">{u.drill}</div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-3">{ago(u.secondsAgo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Over time chart */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-lg">Last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="People" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Sessions" fill="#86efac" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Anonymous: people are counted per device plus the name they enter — there's no login. Real visitors
        appear once the app is deployed and shared; locally you'll see yourself.
      </p>
    </div>
  );
}
