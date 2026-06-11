import { useState } from "react";
import { useLocation } from "wouter";
import { useListDrills, useCreateSession } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Activity, ArrowRight, Clock, Target, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["All", "corver", "dribbling", "juggling", "shooting", "passing"];

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: drills, isLoading } = useListDrills();
  const createSession = useCreateSession();

  const [filter, setFilter] = useState("All");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("footwork_player_name") ?? "");
  const [startingDrillId, setStartingDrillId] = useState<number | null>(null);

  const handleNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem("footwork_player_name", name);
  };

  const filteredDrills = drills?.filter(d => filter === "All" || d.category === filter) || [];

  const handleStart = (drillId: number) => {
    if (!playerName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name before starting a drill.",
        variant: "destructive"
      });
      return;
    }

    setStartingDrillId(drillId);
    createSession.mutate(
      { data: { drillId, playerName } },
      {
        onSuccess: (session) => {
          setLocation(`/train/${drillId}?sessionId=${session.id}`);
        },
        onError: () => {
          toast({
            title: "Failed to start",
            description: "Could not start the session. Please try again.",
            variant: "destructive"
          });
          setStartingDrillId(null);
        }
      }
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-12 text-center md:text-left">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-primary mb-4 uppercase">
          PANNA
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          Professional-grade leg technique training with real-time pose analysis. Select a drill to begin your session.
        </p>
      </header>

      <div className="mb-8 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-white p-6 rounded-xl border border-border shadow-sm">
        <div className="w-full md:w-auto">
          <label htmlFor="player-name" className="block text-sm font-medium mb-2 uppercase text-muted-foreground">Athlete Name</label>
          <Input 
            id="player-name"
            placeholder="Enter your name..." 
            value={playerName} 
            onChange={e => handleNameChange(e.target.value)}
            className="max-w-xs uppercase font-medium placeholder:normal-case"
            data-testid="input-player-name"
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <Badge 
              key={cat}
              variant={filter === cat ? "default" : "outline"}
              className="cursor-pointer px-4 py-2 uppercase tracking-wide cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => setFilter(cat)}
              data-testid={`filter-${cat}`}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
        >
          {filteredDrills.map((drill) => (
            <motion.div
              key={drill.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 }
              }}
            >
              <Card className="h-full flex flex-col hover:border-primary/50 transition-colors overflow-hidden border-2 group">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant={drill.difficulty === 'advanced' ? 'destructive' : drill.difficulty === 'intermediate' ? 'default' : 'secondary'} className="uppercase">
                      {drill.difficulty}
                    </Badge>
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      <Clock className="w-4 h-4 mr-1" />
                      {drill.durationSeconds}s
                    </div>
                  </div>
                  <CardTitle className="text-2xl uppercase tracking-wide group-hover:text-primary transition-colors">
                    {drill.name}
                  </CardTitle>
                  <CardDescription className="uppercase tracking-wider text-xs font-semibold">
                    {drill.category}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow pt-6">
                  <p className="text-sm text-muted-foreground mb-4">{drill.description}</p>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center">
                      <Target className="w-3 h-3 mr-1" /> Focus Points
                    </h4>
                    <ul className="text-sm space-y-1">
                      {drill.keyPoints.slice(0, 3).map((kp, i) => (
                        <li key={i} className="flex items-start">
                          <span className="text-primary mr-2 font-bold">•</span>
                          {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button 
                    className="w-full uppercase font-bold tracking-wider" 
                    size="lg"
                    onClick={() => handleStart(drill.id)}
                    disabled={createSession.isPending && startingDrillId === drill.id}
                    data-testid={`button-start-drill-${drill.id}`}
                  >
                    {createSession.isPending && startingDrillId === drill.id ? (
                      "Preparing..."
                    ) : (
                      <>
                        Start Drill <PlayCircle className="ml-2 w-5 h-5" />
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}