import { useMemo, useState } from "react";
import { useListSessions, useCreateSession } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { History, CheckCircle2, Clock, XCircle, Play, Search } from "lucide-react";
import { fuzzyScore } from "@/lib/fuzzy";

// With thousands of sessions, rendering them all would slow the page down
const MAX_ROWS = 200;

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

export default function Sessions() {
  const { data: sessions, isLoading } = useListSessions();
  const createSession = useCreateSession();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  // Clicking a row starts a REAL session for that drill (with a session id),
  // exactly like starting from the home page.
  const handleRowClick = (drillId: number) => {
    const playerName = localStorage.getItem("footwork_player_name") ?? "";
    if (!playerName.trim()) {
      toast({
        title: "Name required",
        description: "Enter your name on the Home page first, then start any drill.",
        variant: "destructive",
      });
      return;
    }
    createSession.mutate(
      { data: { drillId, playerName } },
      {
        onSuccess: (session) => setLocation(`/train/${drillId}?sessionId=${session.id}`),
        onError: () =>
          toast({
            title: "Failed to start",
            description: "Could not start the session. Please try again.",
            variant: "destructive",
          }),
      }
    );
  };

  // Filter with typo-forgiving search, best matches first
  const filtered = useMemo(() => {
    if (!sessions) return [];
    const q = query.trim();
    if (!q) return sessions;
    return sessions
      .map((s) => ({
        session: s,
        score: fuzzyScore(q, `${s.drillName} ${s.playerName}`),
      }))
      .filter((x) => x.score !== null)
      .sort((a, b) => a.score! - b.score!)
      .map((x) => x.session);
  }, [sessions, query]);

  const visible = filtered.slice(0, MAX_ROWS);

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
          {isLoading
            ? "Loading..."
            : query.trim()
            ? `${filtered.length} of ${sessions?.length ?? 0} sessions match`
            : `${sessions?.length ?? 0} sessions recorded`}
        </p>
      </header>

      <div className="relative max-w-md mx-auto mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by drill or athlete — close spelling works too!"
          className="pl-9"
          data-testid="input-session-search"
        />
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground uppercase text-sm font-bold tracking-wider">
            No sessions yet. Start a drill to begin!
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground" data-testid="text-no-matches">
            <p className="uppercase text-sm font-bold tracking-wider mb-1">
              Nothing close to “{query.trim()}”
            </p>
            <p className="text-sm">Try fewer letters, or check the drill names on the home page.</p>
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
                  <TableHead className="uppercase text-xs font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => (
                  <TableRow
                    key={s.id}
                    className="hover:bg-primary/5 cursor-pointer group"
                    onClick={() => handleRowClick(s.drillId)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {s.startedAt ? formatDate(s.startedAt) : ""}
                    </TableCell>
                    <TableCell className="font-bold uppercase">{s.playerName}</TableCell>
                    <TableCell className="text-sm flex items-center gap-2">
                      <Play className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      {s.drillName}
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold">{s.repCount ?? ""}</TableCell>
                    <TableCell className="text-center font-mono font-bold text-primary">
                      {s.score ?? ""}
                    </TableCell>
                    <TableCell>{statusBadge(s.status ?? "")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > MAX_ROWS && (
              <div className="p-3 text-center text-xs text-muted-foreground uppercase tracking-wider border-t bg-muted/20">
                Showing the first {MAX_ROWS} of {filtered.length} — use the search bar to narrow it down
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
