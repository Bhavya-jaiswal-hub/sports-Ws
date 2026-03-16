import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API_BASE_RAW = (import.meta.env.VITE_API_BASE || "").trim();
const API_BASE =
  API_BASE_RAW ||
  (typeof window !== "undefined" ? window.location.origin : "") ||
  "http://localhost:8000";
const WS_URL =
  (import.meta.env.VITE_WS_URL || "").trim() ||
  API_BASE.replace(/^http(s?):\/\//, "ws$1://").replace(/\/?$/, "") + "/ws";

const SPORT_COLORS = {
  FOOTBALL: { bg: "#d4edda", accent: "#2e7d32", emoji: "⚽" },
  CRICKET: { bg: "#ffeeba", accent: "#f57f17", emoji: "🏏" },
  BASKETBALL: { bg: "#fbd0db", accent: "#c62828", emoji: "🏀" },
  TENNIS: { bg: "#cce5ff", accent: "#1565c0", emoji: "🎾" },
  DEFAULT: { bg: "#e8d5f5", accent: "#6a1b9a", emoji: "🏆" },
};

const getSportStyle = (sport) =>
  SPORT_COLORS[(sport || "").toUpperCase()] || SPORT_COLORS.DEFAULT;

const EVENT_COLORS = {
  GOAL: "#f59e0b",
  SHOT: "#3b82f6",
  PASS: "#10b981",
  FOUL: "#ef4444",
  YELLOW_CARD: "#eab308",
  RED_CARD: "#dc2626",
  SUBSTITUTION: "#8b5cf6",
  KICKOFF: "#06b6d4",
  START: "#22c55e",
  BUILD_UP: "#334155",
  DEFAULT: "#64748b",
};

const getEventColor = (type) =>
  EVENT_COLORS[(type || "").toUpperCase()] || EVENT_COLORS.DEFAULT;

function useWebSocket() {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [apiCount, setApiCount] = useState(0);
  const subscribedRef = useRef(new Set());
  const listenersRef = useRef([]);

  const resubscribeAll = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    subscribedRef.current.forEach((matchId) => {
      wsRef.current?.send(JSON.stringify({ type: "subscribe", matchId }));
    });
  }, []);

  const addListener = useCallback((fn) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((f) => f !== fn);
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      resubscribeAll();
    };
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        listenersRef.current.forEach((fn) => fn(msg));
      } catch {}
    };
  }, [resubscribeAll]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const subscribe = useCallback((matchId) => {
    if (subscribedRef.current.has(matchId)) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", matchId }));
    }
    subscribedRef.current.add(matchId);
  }, []);

  const unsubscribe = useCallback((matchId) => {
    if (!subscribedRef.current.has(matchId)) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", matchId }));
    }
    subscribedRef.current.delete(matchId);
  }, []);

  const incrementApi = useCallback(() => setApiCount((c) => c + 1), []);

  return useMemo(
    () => ({
      connected,
      apiCount,
      incrementApi,
      subscribe,
      unsubscribe,
      addListener,
    }),
    [connected, apiCount, incrementApi, subscribe, unsubscribe, addListener]
  );
}

function ScoreBadge({ score, highlight }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        borderRadius: 10,
        background: highlight ? "#F5C400" : "#dde3ec",
        color: highlight ? "#1a1a1a" : "#0f172a",
        fontFamily: "'Bebas Neue', cursive",
        fontSize: 22,
        fontWeight: 700,
        transition: "all 0.3s ease",
        boxShadow: highlight ? "0 0 0 3px #F5C40044" : "none",
        animation: highlight ? "scorePop 0.4s ease" : "none",
      }}
    >
      {score}
    </span>
  );
}

function StatusDot({ status }) {
  const colors = {
    live: "#22c55e",
    scheduled: "#f59e0b",
    finished: "#64748b",
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: colors[status] || "#64748b",
          display: "inline-block",
          boxShadow: status === "live" ? `0 0 0 3px ${colors.live}33` : "none",
          animation: status === "live" ? "livePulse 1.5s infinite" : "none",
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: colors[status],
          textTransform: "uppercase",
          letterSpacing: 1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {status}
      </span>
    </span>
  );
}

function MatchCard({ match, onWatch, watching, addListener }) {
  const sport = getSportStyle(match.sport);
  const [homeScore, setHomeScore] = useState(match.homeScore);
  const [awayScore, setAwayScore] = useState(match.awayScore);
  const [flashHome, setFlashHome] = useState(false);
  const [flashAway, setFlashAway] = useState(false);
  const [justCreated, setJustCreated] = useState(match._new || false);

  useEffect(() => {
    if (justCreated) {
      const t = setTimeout(() => setJustCreated(false), 1200);
      return () => clearTimeout(t);
    }
  }, [justCreated]);

  useEffect(() => {
    if (match.homeScore !== homeScore) {
      const increased = match.homeScore > homeScore;
      setHomeScore(match.homeScore);
      if (increased) {
        setFlashHome(true);
        setTimeout(() => setFlashHome(false), 600);
      }
    }
    if (match.awayScore !== awayScore) {
      const increased = match.awayScore > awayScore;
      setAwayScore(match.awayScore);
      if (increased) {
        setFlashAway(true);
        setTimeout(() => setFlashAway(false), 600);
      }
    }
  }, [match.homeScore, match.awayScore, homeScore, awayScore]);

  useEffect(() => {
    return addListener((msg) => {
      if (msg.type === "commentary" && msg.data?.matchId === match.id) {
        const d = msg.data;
        if (d.eventType?.toUpperCase() === "GOAL") {
          if (d.team === match.homeTeam) {
            setHomeScore((s) => s + 1);
            setFlashHome(true);
            setTimeout(() => setFlashHome(false), 600);
          } else {
            setAwayScore((s) => s + 1);
            setFlashAway(true);
            setTimeout(() => setFlashAway(false), 600);
          }
        }
      }
    });
  }, [addListener, match]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        border: watching ? `2px solid ${sport.accent}` : "2px solid #dde3ec",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition: "all 0.3s ease",
        boxShadow: watching
          ? `0 8px 32px ${sport.accent}22`
          : "0 4px 24px #00000018",
        animation: justCreated ? "cardSlideIn 0.5s ease" : "none",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {justCreated && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${sport.accent}, #F5C400)`,
            animation: "progressBar 1.2s ease forwards",
          }}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            background: sport.bg,
            color: sport.accent,
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {sport.emoji} {match.sport}
        </span>
        <StatusDot status={match.status} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: "#0a0f1a", letterSpacing: 0.5 }}>
            {match.homeTeam}
          </div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: "#0a0f1a", letterSpacing: 0.5, marginTop: 6 }}>
            {match.awayTeam}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <ScoreBadge score={homeScore} highlight={flashHome} />
          <ScoreBadge score={awayScore} highlight={flashAway} />
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #dde3ec",
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
          {new Date(match.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {watching ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                background: sport.bg,
                color: sport.accent,
                border: "none",
                borderRadius: 20,
                padding: "7px 16px",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              Watching Live
            </button>
            <button
              onClick={() => onWatch(match.id, false)}
              style={{
                background: "#dde3ec",
                color: "#334155",
                border: "none",
                borderRadius: 20,
                padding: "7px 14px",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <button
            onClick={() => onWatch(match.id, true)}
            style={{
              background: "#F5C400",
              color: "#1a1a1a",
              border: "none",
              borderRadius: 20,
              padding: "7px 18px",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: 0.5,
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "scale(1.05)";
              e.target.style.boxShadow = "0 4px 12px #F5C40066";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "none";
            }}
          >
            Watch Live
          </button>
        )}
      </div>
    </div>
  );
}

function CommentaryItem({ item, index }) {
  const color = getEventColor(item.eventType);
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid #dde3ec",
        animation: `commentaryFadeIn 0.4s ease ${index === 0 ? "0s" : ""}`,
        opacity: 1,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 4, flexShrink: 0 }} />
        <div style={{ width: 1, flex: 1, background: "#dde3ec" }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          {item.minute != null && (
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#334155", fontWeight: 700 }}>
              {item.minute}'
            </span>
          )}
          {item.sequence != null && (
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#64748b" }}>
              Seq {item.sequence}
            </span>
          )}
          {item.period && (
            <span style={{ fontSize: 10, color: "#334155", fontFamily: "'DM Mono', monospace" }}>
              {item.period}
            </span>
          )}
          {item.eventType && (
            <span
              style={{
                background: color + "22",
                color,
                borderRadius: 4,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 800,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {item.eventType}
            </span>
          )}
        </div>
        {item.actor && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>
            {item.actor}
            {item.team && (
              <span style={{ fontWeight: 400, color: "#64748b" }}> Â· {item.team}</span>
            )}
          </div>
        )}
        <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5 }}>{item.message}</div>
        {item.tags && (
          <div style={{ marginTop: 5 }}>
            <span style={{ fontSize: 9, color: "#64748b", fontFamily: "'DM Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>
              {item.tags}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SportsEngine() {
  const ws = useWebSocket();
  const [matches, setMatches] = useState([]);
  const [commentary, setCommentary] = useState([]);
  const [watchingId, setWatchingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchesError, setMatchesError] = useState(null);
  const commentaryRef = useRef(null);

  const { incrementApi, addListener, subscribe, unsubscribe, connected, apiCount } = ws;

  const fetchMatches = useCallback(async () => {
    try {
      setMatchesError(null);
      incrementApi();
      const res = await fetch(new URL("/matches", API_BASE));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const snippet = (await res.text()).slice(0, 120);
        throw new Error(`Expected JSON but got '${contentType}' (${snippet || "no body"})`);
      }

      const json = await res.json();
      setMatches(json.data || []);
    } catch (e) {
      console.error("Failed to fetch matches", e);
      const reason =
        e?.cause?.message ||
        (e?.message === "Failed to fetch" ? "Network/CORS/Mixed content" : e?.message) ||
        "Failed to fetch matches";
      setMatchesError(reason);
    } finally {
      setLoading(false);
    }
  }, [incrementApi]);

  const fetchCommentary = useCallback(async (matchId) => {
    try {
      incrementApi();
      const res = await fetch(new URL(`/matches/${matchId}/commentary?limit=50`, API_BASE));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const snippet = (await res.text()).slice(0, 120);
        throw new Error(`Expected JSON but got '${contentType}' (${snippet || "no body"})`);
      }

      const json = await res.json();
      setCommentary(json.data || []);
    } catch (e) {
      console.error("Failed to fetch commentary", e);
    }
  }, [incrementApi]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    return addListener((msg) => {
      if (msg.type === "match_created") {
        setMatches((prev) => [{ ...msg.data, _new: true }, ...prev]);
      }
      if (msg.type === "commentary" && msg.data?.matchId === watchingId) {
        setCommentary((prev) => [msg.data, ...prev]);
        setTimeout(() => {
          if (commentaryRef.current) {
            commentaryRef.current.scrollTop = 0;
          }
        }, 50);
      }
    });
  }, [addListener, watchingId]);

  const handleWatch = useCallback((matchId, watch) => {
    if (watchingId) unsubscribe(watchingId);
    if (watch) {
      setWatchingId(matchId);
      subscribe(matchId);
      fetchCommentary(matchId);
    } else {
      setWatchingId(null);
      setCommentary([]);
    }
  }, [watchingId, subscribe, unsubscribe, fetchCommentary]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #e8ecf0; font-family: 'DM Sans', sans-serif; }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 0 #22c55e44; }
          50% { box-shadow: 0 0 0 6px #22c55e22; }
        }
        @keyframes scorePop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes cardSlideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes commentaryFadeIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes progressBar {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes connectedPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #dde3ec; border-radius: 2px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#e8ecf0" }}>
        {/* Header */}
        <div
          style={{
            background: "#F5C400",
            padding: "16px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, color: "#1a1a1a", letterSpacing: 2, lineHeight: 1 }}>
              Spofrz
            </div>
            <div style={{ fontSize: 11, color: "#1a1a1a99", fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>
              Real-time match data demo
            </div>
          </div>
          <div
            style={{
              background: connected ? "#1a1a1a" : "#ef4444",
              color: "#fff",
              borderRadius: 30,
              padding: "8px 18px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 700,
              letterSpacing: 1,
              transition: "background 0.3s ease",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connected ? "#22c55e" : "#fca5a5",
                animation: connected ? "connectedPulse 2s infinite" : "none",
              }}
            />
            {connected ? "LIVE CONNECTED" : "RECONNECTING..."}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "stretch",
            minHeight: "calc(100vh - 74px)",
            padding: 12,
          }}
        >
          {/* Matches Panel */}
          <div
            style={{
              flex: "2 1 320px",
              padding: 12,
              overflowY: "auto",
              minWidth: 280,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 4, height: 22, background: "#F5C400", borderRadius: 2 }} />
                <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: "#0a0f1a", letterSpacing: 1 }}>
                  Current Matches
                </h2>
              </div>
              <div
                style={{
                  background: "#0a0f1a",
                  color: "#F5C400",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontFamily: "'DM Mono', monospace",
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                API: {apiCount}
              </div>
            </div>

            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 18, height: 180, border: "2px solid #dde3ec", animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
            ) : matchesError ? (
              <div style={{ background: "#fff3cd", border: "1px solid #facc15", color: "#7c2d12", padding: 14, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                <strong>Unable to load matches.</strong>
                <div style={{ fontSize: 12 }}>
                  {matchesError}. Make sure the API is reachable (same origin or set <code>VITE_API_BASE</code>) and not blocked by Mixed Content if the site is served over HTTPS. If you see a DOCTYPE snippet, the request is hitting HTML (likely your frontend) instead of the API; set the correct API base including any <code>/api</code> prefix.
                </div>
              </div>
            ) : matches.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
                No matches found
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    watching={watchingId === match.id}
                    onWatch={handleWatch}
                    addListener={addListener}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Commentary Panel */}
          <div
            style={{
              flex: "1 1 320px",
              maxWidth: 420,
              minWidth: 280,
              width: "100%",
              background: "#fff",
              borderLeft: "1px solid #dde3ec",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 6px 20px #00000012",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #dde3ec",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: watchingId ? "#f0fdf4" : "#fff",
                transition: "background 0.3s ease",
              }}
            >
              <h3 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: "#0a0f1a", letterSpacing: 1 }}>
                Live Commentary
              </h3>
              <span
                style={{
                  background: watchingId ? "#22c55e" : "#dde3ec",
                  color: watchingId ? "#fff" : "#64748b",
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 10,
                  fontFamily: "'DM Mono', monospace",
                  fontWeight: 700,
                  letterSpacing: 1,
                  transition: "all 0.3s ease",
                }}
              >
                {watchingId ? "REAL-TIME" : "IDLE"}
              </span>
            </div>

            <div ref={commentaryRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
              {!watchingId ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 12,
                    color: "#64748b",
                    textAlign: "center",
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 40 }}>ðŸ“¡</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.6 }}>
                    Click <strong style={{ color: "#1a1a1a" }}>Watch Live</strong> on any match to see real-time commentary here
                  </div>
                </div>
              ) : commentary.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 12,
                    color: "#64748b",
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, animation: "livePulse 1.5s infinite" }}>âš¡</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    Waiting for live events...
                  </div>
                </div>
              ) : (
                commentary.map((item, i) => (
                  <CommentaryItem key={item.id || i} item={item} index={i} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


