import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet, getClientIp } from "../arcjet.js";
import { redisSubscribe, redisUnsubscribe, CHANNELS } from "../redis-pubsub.js";

const matchSubscribers = new Map();

// tracks which Redis channels this server has subscribed to
// so we don't subscribe to the same channel twice
const redisChannelSubscribed = new Set();

function subscribe(matchId, socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }
  matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return;
  subscribers.delete(socket);
  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

function cleanupSubscriptions(socket) {
  for (const matchId of socket.Subscriptions) {
    unsubscribe(matchId, socket);
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

// this function stays exactly the same
// it's just now called by Redis subscriber instead of directly
function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers || subscribers.size === 0) return;
  const message = JSON.stringify(payload);
  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// ─── REDIS CHANNEL SUBSCRIPTION ──────────────────────────────────────────────
// When a WS client subscribes to matchId 3:
//   → we also subscribe THIS SERVER to Redis channel "match:3:commentary"
//   → so when any server publishes to that channel, THIS server gets it
//   → and broadcasts to its local WS clients

async function ensureRedisChannelSubscribed(matchId) {
  const channel = CHANNELS.commentary(matchId);

  // already subscribed to this Redis channel — skip
  if (redisChannelSubscribed.has(channel)) return;

  await redisSubscribe(channel, (data) => {
    // Redis message arrives → broadcast to local WS clients of this match
    console.log(`📨 Redis message on ${channel} → broadcasting to WS clients`);
    broadcastToMatch(matchId, { type: "commentary", data });
  });

  redisChannelSubscribed.add(channel);
}

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────
const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;
const isValidMatchId = (value) => Number.isSafeInteger(value) && value > 0;

function handleMessage(socket, data) {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    sendJson(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (message?.type === "subscribe") {
    if (!isValidMatchId(message.matchId)) {
      sendJson(socket, { type: "error", message: "Invalid matchId" });
      return;
    }
    if (
      !socket.Subscriptions.has(message.matchId) &&
      socket.Subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET
    ) {
      sendJson(socket, { type: "error", message: "Subscription limit reached" });
      return;
    }

    subscribe(message.matchId, socket);
    socket.Subscriptions.add(message.matchId);

    // ← NEW: also subscribe this server to Redis channel for this match
    ensureRedisChannelSubscribed(message.matchId).catch((err) => {
      console.error("Failed to subscribe Redis channel:", err);
    });

    sendJson(socket, { type: "subscribed", matchId: message.matchId });
    return;
  }

  if (message?.type === "unsubscribe" && Number.isInteger(message.matchId)) {
    unsubscribe(message.matchId, socket);
    socket.Subscriptions.delete(message.matchId);
    sendJson(socket, { type: "unsubscribed", matchId: message.matchId });
  }
}

// ─── ATTACH WS SERVER ────────────────────────────────────────────────────────
export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024 });

  wss.on("connection", async (socket, req) => {
    if (wsArcjet && (process.env.ARCJET_ENV || "").toLowerCase() !== "development") {
      try {
        const ip = getClientIp(req);
        if (ip && !req.headers["x-forwarded-for"]) {
          req.headers["x-forwarded-for"] = ip;
        }
        const decision = await wsArcjet.protect(req);
        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;
          const reason = decision.reason.isRateLimit() ? "Rate Limit exceeded" : "Access Denied";
          socket.close(code, reason);
          return;
        }
      } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("ip")) {
          console.warn("Arcjet WS skipped (missing ip characteristic)");
        } else {
          console.error("ws connection error", e);
        }
        socket.close(1011, "server security error");
        return;
      }
    }

    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    socket.Subscriptions = new Set();

    sendJson(socket, { type: "welcome" });

    socket.on("message", (data) => { handleMessage(socket, data); });
    socket.on("error", (err) => {
      console.error("WebSocket error:", err);
      socket.terminate();
    });
    socket.on("close", () => { cleanupSubscriptions(socket); });
  });

  // heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  // ─── BROADCAST FUNCTIONS ────────────────────────────────────────────────────
  // broadcastMatchCreated still uses direct broadcast
  // because it goes to ALL clients (no Redis needed for single server)
  // When you scale to multiple servers, this can also use Redis Pub/Sub

  function broadcastMatchCreated(match) {
    broadcastToAll(wss, { type: "match_created", data: match });
  }

  // broadcastCommentary is now handled by Redis Pub/Sub
  // routes call redisPublish() → Redis → this server's subscriber → broadcastToMatch()
  // this function is kept as fallback if Redis is unavailable
  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, { type: "commentary", data: comment });
  }

  return { broadcastMatchCreated, broadcastCommentary };
}