import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 10);

let clientPromise = null;

async function getClient() {
 if (!redisUrl || redisUrl.trim() === "") return null;
  if (!clientPromise) {
    const client = createClient({
      url: redisUrl,
      socket: {
        // ✅ Auto-enables TLS for Upstash (rediss://)
        // and keeps it off for local Docker Redis (redis://)
        tls: redisUrl.startsWith("rediss://"),
        reconnectStrategy: (retries) => {
          if (retries > 5) return false; // stop retrying after 5 attempts
          return Math.min(retries * 500, 3000); // wait 500ms, 1000ms, 1500ms...
        }
      }
    });

    client.on("error", (err) => console.error("Redis error", err));

    clientPromise = client.connect()
      .then(() => {
        console.log("✅ Redis connected");
        return client;
      })
      .catch((err) => {
        console.error("Redis connect failed", err);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

export async function getCache(key) {
  const client = await getClient();
  if (!client) return null;
  try {
    const value = await client.get(key);
    if (value) {
      console.log(`🟢 Cache HIT: ${key}`);
    } else {
      console.log(`🔴 Cache MISS: ${key}`);
    }
    return value;
  } catch (e) {
    console.error("Redis get error", e);
    return null;
  }
}

export async function setCache(key, value, ttl = CACHE_TTL_SECONDS) {
  const client = await getClient();
  if (!client) return;
  try {
    await client.setEx(key, ttl, value);
  } catch (e) {
    console.error("Redis set error", e);
  }
}

export async function delCache(key) {
  const client = await getClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (e) {
    console.error("Redis del error", e);
  }
}

export async function delByPattern(pattern) {
  const client = await getClient();
  if (!client) return;
  try {
    const iter = client.scanIterator({ MATCH: pattern });
    for await (const key of iter) {
      await client.del(key);
    }
  } catch (e) {
    console.error("Redis pattern del error", e);
  }
}