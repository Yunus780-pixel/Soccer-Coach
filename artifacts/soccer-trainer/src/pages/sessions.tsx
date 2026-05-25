import { useListSessions } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, CheckCircle2, Clock, XCircle } from "lucide-react";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  if (status === "completed") {
    return <Badge className="bg-primary text-white gap-1"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />In Progress</Badge>;
  }
  if (status === "pending" || status === "not_done") {
    return <Badge variant="outline" className="gap-1 text-muted-foreground"><Clock className="w-3 h-3" />Not Done</Badge>;
  }
  return <Badge variant="outline" className="gap-1"><XCircle className="w-3 h-3" />{status}</Badge>;
}

function verdictBadge(verdict?: string | null) {
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  const colors: Record<string, string> = {
    excellent: "bg-primary/20 text-primary border-primary/30",
    good: "bg-blue-100 text-blue-700 border-blue-200",
    needs_work: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <Badge variant="outline" className={`uppercase ${colors[verdict] ?? ""}`}>
      {verdict.replace("_", " ")}
    </Badge>
  );
}

export default function Sessions() {
  const { data: sessions, isLoading } = useListSessions();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-4">
          <History className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase text-foreground mb-2">
          Sessions
        </h1>
        <p className="text-muted-foreground uppercase tracking-widest text-sm font-semibold">
          {isLoading ? "Loading..." : `${sessions?.length ?? 0} sessions recorded`}
        </p>
      </header>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground uppercase text-sm font-bold tracking-wider">
            No sessions yet. Start a drill to begin!
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 border-b">
                <TableRow>
                  <TableHead className="uppercase text-xs font-bold">Date</TableHead>
                  <TableHead className="uppercase text-xs font-bold">Athlete</TableHead>
                  <TableHead className="uppercase text-xs font-bold">Drill</TableHead>
                  <TableHead className="uppercase text-xs font-bold text-center">Reps</TableHead>
                  <TableHead className="uppercase text-xs font-bold text-center">Score</TableHead>
                  <TableHead className="uppercase text-xs font-bold">Verdict</TableHead>
                  <TableHead className="uppercase text-xs font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(s.startedAt)}
                    </TableCell>
                    <TableCell className="font-bold uppercase">{s.playerName}</TableCell>
                    <TableCell className="text-sm">{s.drillName}</TableCell>
                    <TableCell className="text-center font-mono font-bold">{s.repCount ?? "—"}</TableCell>
                    <TableCell className="text-center font-mono font-bold text-primary">
                      {s.score ?? "—"}
                    </TableCell>
                    <TableCell>{verdictBadge(s.feedbackSummary)}</TableCell>
                    <TableCell>{statusBadge(s.status ?? "")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
