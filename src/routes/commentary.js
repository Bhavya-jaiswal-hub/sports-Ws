import { Router } from 'express'
import { desc, eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { redisPublish, CHANNELS } from "../redis-pubsub.js";
import { matchIdParamSchema } from "../validation/matches.js";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { getCache, setCache, delByPattern } from "../redis.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

/**
 * GET /matches/:matchId/commentary
 */
commentaryRouter.get('/', async (req, res) => {
  // 1. Validate params
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(400).json({
      error: "Invalid match ID.",
      details: paramsResult.error.issues,
    });
  }

  // 2. Validate query
  const queryResult = listCommentaryQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: "Invalid query parameters.",
      details: queryResult.error.issues,
    });
  }

  const matchId = paramsResult.data.id;
  const limit = Math.min(queryResult.data.limit ?? 100, MAX_LIMIT);

  try {
    // 3. Check cache first
    const cacheKey = `commentary:${matchId}:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return res.status(200).json({
        count: data.length,
        data,
        cached: true,   // useful for debugging - tells you it came from Redis
      });
    }

    // 4. Cache miss - fetch from DB
    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    // 5. Store in cache for next request
    await setCache(cacheKey, JSON.stringify(results));

    return res.status(200).json({
      count: results.length,
      data: results,
      cached: false,    // consistent shape - always present
    });

  } catch (error) {
    console.error("Failed to fetch commentary:", error);
    return res.status(500).json({
      error: "Failed to fetch commentary.",
    });
  }
});

/**
 * POST /matches/:matchId/commentary
 */
commentaryRouter.post("/", async (req, res) => {
  // 1. Validate params
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(400).json({
      error: 'Invalid match ID.',
      details: paramsResult.error.issues
    });
  }

  // 2. Validate body
  const bodyResult = createCommentarySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: 'Invalid commentary payload.',
      details: bodyResult.error.issues
    });
  }

  try {
    const { minute, ...rest } = bodyResult.data;

    // 3. Insert into DB
    const [result] = await db.insert(commentary).values({
      matchId: paramsResult.data.id,
      minute,
      ...rest
    }).returning();

    // 4. Invalidate all related cache keys BEFORE broadcasting
    // matches:* covers both matches:list:* and matches:{id}
    await Promise.all([
      delByPattern(`commentary:${result.matchId}:*`),
      delByPattern('matches:*'),
    ]);

    // 5. Broadcast to WebSocket subscribers of this match
   await redisPublish(CHANNELS.commentary(result.matchId), result);

    return res.status(201).json({ data: result });

  } catch (error) {
    console.error('Failed to create commentary:', error);
    return res.status(500).json({ error: 'Failed to create commentary.' });
  }
});