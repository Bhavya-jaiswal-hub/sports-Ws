import { Router} from 'express'
import { desc, eq } from "drizzle-orm";
import { db } from "../db/db.js"; // your drizzle db instance
import { commentary } from "../db/schema.js"; // your drizzle table schema
import { matchIdParamSchema } from "../validation/matches.js"
import { createCommentarySchema } from "../validation/commentary.js";
import { listCommentaryQuerySchema } from "../validation/commentary.js";
export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get('/' ,  async (req, res) => {
      // 1️⃣ Validate params
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(400).json({
      error: "Invalid match ID.",
      details: paramsResult.error.issues,
    });
  }

  // 2️⃣ Validate query
  const queryResult = listCommentaryQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: "Invalid query parameters.",
      details: queryResult.error.issues,
    });
  }

  try {
    const matchId = paramsResult.data.id;

    // 3️⃣ Apply default + safety cap
    const limit = Math.min(
      queryResult.data.limit ?? 100,
      MAX_LIMIT
    );

    // 4️⃣ Fetch from DB
    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.status(200).json({
      count: results.length,
      data: results,
    });

  } catch (error) {
    console.error("Failed to fetch commentary:", error);
    return res.status(500).json({
      error: "Failed to fetch commentary.",
    });
  }
})


/**
 * POST /matches/:matchId/commentary
 */
commentaryRouter.post("/", async (req, res) => {
    const paramsResult = matchIdParamSchema.safeParse(req.params);
      

   

    if(!paramsResult.success){
         return res.status(400).json({ error: 'Invalid match ID.' , details: paramsResult.error.issues});
    } 

    const bodyResult = createCommentarySchema.safeParse(req.body);

    if (process.env.NODE_ENV !== "production") {
      console.debug("Received commentary payload");
    }
    if(!bodyResult.success){
         return res.status(400).json({error: 'Invalid commentary payload.', details: bodyResult.error.issues});
    } 


    try {
        const { minute , ...rest} = bodyResult.data;
        const [result] = await db.insert(commentary).values({
            matchId: paramsResult.data.id,
            minute,
                        ...rest
        }).returning(); 

         if (res.app.locals.broadcastCommentary) {
         try {
           res.app.locals.broadcastCommentary(result.matchId, result);
          } catch (broadcastError) {
            console.error("Failed to broadcast commentary:", broadcastError);
          }
        }

        return res.status(201).json({ data: result });
    } catch (error) {
        console.error('Failed to create commentary:' , error);
        res.status(500).json({error: 'Failed to create commentary.'});
    }
});
