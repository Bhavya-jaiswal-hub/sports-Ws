import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

// ─── PUBLISHER ───────────────────────────────────────────────────────────────
// Used by routes to PUBLISH events into Redis channels
// Separate client from your main cache client

let publisherPromise = null;

async function getPublisher() {
  if (!redisUrl) return null;
  if (!publisherPromise) {
    const client = createClient({
  url: redisUrl,
  socket: {
    tls: redisUrl.startsWith("rediss://"), // ✅ add this line
    reconnectStrategy: (retries) => {
      if (retries > 5) return false;
      return Math.min(retries * 500, 3000);
    }
  }
});
    client.on("error", (err) => console.error("Redis publisher error:", err));
    publisherPromise = client.connect()
      .then(() => {
        console.log("✅ Redis publisher connected");
        return client;
      })
      .catch((err) => {
        console.error("Redis publisher connect failed:", err);
        publisherPromise = null;
        return null;
      });
  }
  return publisherPromise;
}

// ─── SUBSCRIBER ──────────────────────────────────────────────────────────────
// Used by WebSocket server to LISTEN to Redis channels
// Must be a SEPARATE client from publisher
// (Redis rule: once a client subscribes, it can only subscribe/unsubscribe)

let subscriberPromise = null;

async function getSubscriber() {
  if (!redisUrl) return null;
  if (!subscriberPromise) {
    const client = createClient({
  url: redisUrl,
  socket: {
    tls: redisUrl.startsWith("rediss://"), // ✅ add this line
    reconnectStrategy: (retries) => {
      if (retries > 5) return false;
      return Math.min(retries * 500, 3000);
    }
  }
});
    client.on("error", (err) => console.error("Redis subscriber error:", err));
    subscriberPromise = client.connect()
      .then(() => {
        console.log("✅ Redis subscriber connected");
        return client;
      })
      .catch((err) => {
        console.error("Redis subscriber connect failed:", err);
        subscriberPromise = null;
        return null;
      });
  }
  return subscriberPromise;
}

// ─── CHANNEL NAMES ───────────────────────────────────────────────────────────
// Centralized channel name functions so routes and ws server use same names
// Think of these like WhatsApp group names

export const CHANNELS = {
  // channel for commentary of a specific match
  // e.g. "match:3:commentary"
  commentary: (matchId) => `match:${matchId}:commentary`,

  // channel for new match created (broadcast to everyone)
  // e.g. "match:created"
  matchCreated: () => `match:created`,
};

// ─── PUBLISH ─────────────────────────────────────────────────────────────────
// Called by routes after DB insert
// Publishes data into a Redis channel

export async function redisPublish(channel, data) {
  const publisher = await getPublisher();
  if (!publisher) {
    console.warn(`⚠️ Redis unavailable - skipping publish to ${channel}`);
    return;
  }
  try {
    await publisher.publish(channel, JSON.stringify(data));
    console.log(`📢 Published to channel: ${channel}`);
  } catch (err) {
    console.error(`Redis publish error on channel ${channel}:`, err);
  }
}

// ─── SUBSCRIBE ───────────────────────────────────────────────────────────────
// Called by WebSocket server to listen to a channel
// callback is called with parsed data whenever a message arrives

export async function redisSubscribe(channel, callback) {
  const subscriber = await getSubscriber();
  if (!subscriber) {
    console.warn(`⚠️ Redis unavailable - skipping subscribe to ${channel}`);
    return;
  }
  try {
    await subscriber.subscribe(channel, (message) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (err) {
        console.error(`Failed to parse message on channel ${channel}:`, err);
      }
    });
    console.log(`👂 Subscribed to channel: ${channel}`);
  } catch (err) {
    console.error(`Redis subscribe error on channel ${channel}:`, err);
  }
}

// ─── UNSUBSCRIBE ─────────────────────────────────────────────────────────────
export async function redisUnsubscribe(channel) {
  const subscriber = await getSubscriber();
  if (!subscriber) return;
  try {
    await subscriber.unsubscribe(channel);
    console.log(`🔇 Unsubscribed from channel: ${channel}`);
  } catch (err) {
    console.error(`Redis unsubscribe error on channel ${channel}:`, err);
  }
}