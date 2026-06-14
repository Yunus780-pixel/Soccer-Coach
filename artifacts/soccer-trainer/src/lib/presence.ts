// Client-side presence: tells the server this person is using the app and
// what they're doing, so the /monitor dashboard can show who's online now and
// usage over time. No login — each device gets a random anonymous id, plus the
// athlete name they typed on the home page.
const CLIENT_KEY = "panna-client-id";
const NAME_KEY = "footwork_player_name"; // set by the home page name field

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

let currentActivity = "Browsing";
let pingNow: () => void = () => {};

/** Report what the user is currently doing (e.g. the drill name). */
export function setActivity(activity: string): void {
  if (!activity || activity === currentActivity) return;
  currentActivity = activity;
  pingNow(); // push the change immediately so the monitor updates fast
}

/** Start sending heartbeats. Returns a cleanup function. */
export function startHeartbeat(): () => void {
  const send = () => {
    let name = "Anonymous";
    try {
      name = localStorage.getItem(NAME_KEY)?.trim() || "Anonymous";
    } catch {
      /* ignore */
    }
    fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: getClientId(), name, drill: currentActivity }),
      keepalive: true,
    }).catch(() => {});
  };

  pingNow = send;
  send();
  const interval = window.setInterval(send, 15000);
  const onVisible = () => {
    if (document.visibilityState === "visible") send();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    pingNow = () => {};
  };
}
