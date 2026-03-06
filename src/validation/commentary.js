import { z } from "zod";

/**
 * Query schema for listing commentary
 * Example: GET /commentary?limit=20
 */
export const listCommentaryQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional(),
});

/**
 * Schema for creating a commentary entry
 * Example: POST /commentary
 */
export const createCommentarySchema = z.object({
  minute: z
    .number()
    .int()
    .min(0, "Minute must be a non-negative integer"),

  sequence: z
    .number()
    .int()
    .min(0, "Sequence must be a non-negative integer"),

  period: z
    .string()
    .min(1, "Period is required"),

  eventType: z
    .string()
    .min(1, "Event type is required"),

  actor: z
    .string()
    .min(1, "Actor is required"),

  team: z
    .string()
    .min(1, "Team is required"),

  message: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Message is required"
         : "Not a string",
    })
    .min(1, { error: "Message cannot be empty" }),

  metadata: z
    .record( z.string() ,z.any())
    .optional(),

  tags: z
    .array(z.string())
    .optional(),
});