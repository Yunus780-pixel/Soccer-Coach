import { useGetStatsSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Target, CheckCircle2, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Stats() {
  const { data: stats, isLoading } = useGetStatsSummary();

  const statCards = [
    {
      title: "Total Sessions",
      value: stats?.totalSessions || 0,
      icon: Activity,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Average Score",
      value: stats ? stats.avgScore.toFixed(1) : 0,
      icon: Target,
      color: "text-primary",
      bg: "bg-primary/10"
    },
    {
      title: "Active Athletes",
      value: stats?.totalPlayers || 0,
      icon: Users,
      color: "text-orange-500",
      bg: "bg-orange-500/10"
    },
    {
      title: "Completed Today",
      value: stats?.completedToday || 0,
      icon: CheckCircle2,
      color: "text-purple-500",
      bg: "bg-purple-500/10"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase text-foreground mb-2">
          Community Stats
        </h1>
        <p className="text-muted-foreground uppercase tracking-widest text-sm font-semibold">
          Platform-wide performance metrics
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
        ) : (
          statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-md ${stat.bg}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold font-mono text-foreground">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="uppercase tracking-wider text-lg flex items-center">
              <TrendingUp className="mr-2 w-5 h-5 text-primary" /> Most Popular Drill
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="bg-muted/30 p-6 rounded-xl border text-center">
                <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Top Pick</div>
                <div className="text-3xl font-bold uppercase text-primary">{stats?.topDrill || "N/A"}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}