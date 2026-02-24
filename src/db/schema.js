// src/db/schema.js

import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb
} from 'drizzle-orm/pg-core';

/**
 * ENUM: match_status
 * scheduled | live | finished
 */
export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'live',
  'finished'
]);

/**
 * TABLE: matches
 */
export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),

  sport: text('sport').notNull(),

  homeTeam: text('home_team').notNull(),
  awayTeam: text('away_team').notNull(),

  status: matchStatusEnum('status')
    .default('scheduled')
    .notNull(),

  startTime: timestamp('start_time'),
  endTime: timestamp('end_time'),

  homeScore: integer('home_score')
    .default(0)
    .notNull(),

  awayScore: integer('away_score')
    .default(0)
    .notNull(),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/**
 * TABLE: commentary
 */
export const commentary = pgTable('commentary', {
  id: serial('id').primaryKey(),

  matchId: integer('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),

  minute: integer('minute'),
  sequence: integer('sequence'), // ordering inside same minute
  period: text('period'), // e.g. "1H", "2H", "Extra", etc.

  eventType: text('event_type'), // goal, foul, yellow_card, etc.
  actor: text('actor'),          // player name
  team: text('team'),

  message: text('message').notNull(),

  metadata: jsonb('metadata'),   // extra structured data
  tags: text('tags'),            // comma separated tags (simple version)

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});