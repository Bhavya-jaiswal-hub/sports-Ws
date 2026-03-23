import {Router} from 'express'
// Add this to your imports
import { createMatchSchema, listMatchesQuerySchema, matchIdParamSchema } from '../validation/matches.js';
import { getMatchStatus } from '../utils/match-status.js';
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';  
import { string } from 'zod';
import { desc, eq } from 'drizzle-orm'; 
import { getCache, setCache, delByPattern, CACHE_TTL_SECONDS } from '../redis.js';


export const  matchRouter = Router(); 

const MAX_LIMIT = 100;

matchRouter.get('/' ,  async(req, res) => {
     const parsed = listMatchesQuerySchema.safeParse(req.query)

      if(!parsed.success) {
         return res.status(400).json({ error: 'Invalid query.' , details: JSON.stringify(parsed.error)})
     } 

     const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

     const cacheKey = `matches:list:${limit}`;
     const cached = await getCache(cacheKey);
     if (cached) {
        return res.json({ data: JSON.parse(cached) });
     }

     try{
         const data = await db
         .select() 
         .from(matches)
         .orderBy((desc(matches.createdAt)))
         .limit(limit) 

         await setCache(cacheKey, JSON.stringify(data));
         return res.json({ data})
     } catch(error) {
        //  res.status(500).json({ error: 'Failed to list matches.'});

         console.error(error);
   res.status(500).json({ error: error.message });
     }
}) 

matchRouter.get('/:id', async (req, res) => {
     const parsed = matchIdParamSchema.safeParse(req.params);
     if(!parsed.success){
        return res.status(400).json({ error: 'Invalid match ID.', details: parsed.error.issues});
     }
     const matchId = parsed.data.id;
     const cacheKey = `matches:${matchId}`;
     const cached = await getCache(cacheKey);
     if (cached) {
        const parsedMatch = JSON.parse(cached);
        if (parsedMatch) return res.json({ data: parsedMatch });
     }

     try {
        const [row] = await db.select().from(matches).where(eq(matches.id, matchId));
        if (!row) {
            return res.status(404).json({ error: 'Match not found.'});
        }
        await setCache(cacheKey, JSON.stringify(row));
        return res.json({ data: row });
     } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to fetch match.'});
     }
});


matchRouter.post('/', async (req, res) => {
  // 1. Validate request body
  const parsed = createMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      details: JSON.stringify(parsed.error)
    });
  }

  const { startTime, endTime, homeScore, awayScore } = parsed.data;

  try {
    // 2. Insert into DB
    const [event] = await db.insert(matches).values({
      ...parsed.data,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
      status: getMatchStatus(startTime, endTime),
    }).returning();

    // 3. Invalidate cache BEFORE broadcasting
    // matches:* covers both matches:list:* and matches:{id} keys
    await delByPattern('matches:*');

    // 4. Broadcast to WebSocket clients AFTER cache is cleared
    // so when clients re-fetch they get fresh data
    if (res.app.locals.broadcastMatchCreated) {
      try {
        res.app.locals.broadcastMatchCreated(event);
      } catch (broadcastError) {
        console.error('Failed to broadcast match_created:', broadcastError);
      }
    }

    // 5. Return the created match
    return res.status(201).json({ data: event });

  } catch (e) {
    console.error('Failed to create match:', e);
    return res.status(500).json({ error: 'Failed to create match.' });
  }
});