import { useGetLeaderboard } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetLeaderboard();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-4">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase text-foreground mb-2">
          Global Leaderboard
        </h1>
        <p className="text-muted-foreground uppercase tracking-widest text-sm font-semibold">
          Top performers in PANNA
        </p>
      </header>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[100px] text-center font-bold uppercase tracking-wider">Rank</TableHead>
                <TableHead className="font-bold uppercase tracking-wider">Athlete</TableHead>
                <TableHead className="text-center font-bold uppercase tracking-wider">Avg Score</TableHead>
                <TableHead className="text-center font-bold uppercase tracking-wider">Sessions</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-wider">Top Drill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard?.map((entry) => (
                <TableRow 
                  key={entry.rank}
                  className={entry.rank <= 3 ? "bg-primary/5 hover:bg-primary/10 transition-colors" : ""}
                >
                  <TableCell className="text-center font-bold">
                    {entry.rank === 1 ? <Trophy className="w-5 h-5 text-yellow-500 mx-auto" /> :
                     entry.rank === 2 ? <Medal className="w-5 h-5 text-gray-400 mx-auto" /> :
                     entry.rank === 3 ? <Award className="w-5 h-5 text-amber-700 mx-auto" /> :
                     <span className="text-muted-foreground">{entry.rank}</span>}
                  </TableCell>
                  <TableCell className="font-bold text-base uppercase">
                    {entry.playerName}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={entry.avgScore >= 90 ? "default" : "secondary"} className="text-lg font-mono px-3 py-1">
                      {entry.avgScore.toFixed(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono font-medium text-muted-foreground">
                    {entry.totalSessions}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground font-medium uppercase tracking-wide">
                    {entry.bestDrill}
                  </TableCell>
                </TableRow>
              ))}
              {(!leaderboard || leaderboard.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground uppercase tracking-widest text-sm">
                    No leaderboard data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}