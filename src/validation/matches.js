import { z } from "zod";

/**
 * MATCH STATUS CONSTANT
 */
export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
};

/**
 * LIST MATCHES QUERY SCHEMA
 * Example: /matches?limit=10
 */
export const listMatchesQuerySchema = z.object({
  limit: z
    .coerce.number()
    .int()
    .positive()
    .max(100)
    .optional(),
});

/**
 * MATCH ID PARAM SCHEMA
 * Example: /matches/5
 */
export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * CREATE MATCH SCHEMA
 */
export const createMatchSchema = z
  .object({
    sport: z.string().min(1, "Sport is required"),
    homeTeam: z.string().min(1, "Home team is required"),
    awayTeam: z.string().min(1, "Away team is required"),

     startTime: z.iso.datetime({ error: "startTime must be a valid ISO date string" }),

    endTime: z.iso.datetime({ error: "endTime must be a valid ISO date string" }),

    homeScore: z.coerce.number().int().min(0).optional(),
    awayScore: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime must be after startTime",
        path: ["endTime"],
      });
    }
  });

/**
 * UPDATE SCORE SCHEMA
 */
export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().min(0),
  awayScore: z.coerce.number().int().min(0),
});