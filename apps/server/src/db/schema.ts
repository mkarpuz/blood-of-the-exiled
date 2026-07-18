import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('accounts_username_lower_idx').on(table.username)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash), index('sessions_account_idx').on(table.accountId)],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    state: jsonb('state').notNull(),
    lastQuizAt: bigint('last_quiz_at', { mode: 'number' }).notNull().default(0),
    lastLethalQuizAt: bigint('last_lethal_quiz_at', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('characters_account_idx').on(table.accountId), uniqueIndex('characters_name_lower_idx').on(table.name)],
);

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    subject: text('subject').notNull(),
    language: text('language').notNull(),
    encryptedSource: text('encrypted_source').notNull(),
    characterCount: integer('character_count').notNull(),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('materials_account_idx').on(table.accountId)],
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    encryptedContent: text('encrypted_content').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    verified: boolean('verified').notNull().default(false),
    seenCount: integer('seen_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('questions_material_idx').on(table.materialId)],
);

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    correct: boolean('correct').notNull(),
    lethal: boolean('lethal').notNull(),
    responseMs: integer('response_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('attempts_character_idx').on(table.characterId)],
);

export const auctions = pgTable(
  'auctions',
  {
    id: uuid('id').primaryKey(),
    sellerCharacterId: uuid('seller_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    item: jsonb('item').notNull(),
    price: integer('price').notNull(),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auctions_status_expiry_idx').on(table.status, table.expiresAt)],
);

export const worldState = pgTable('world_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const economyAudit = pgTable(
  'economy_audit',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    details: jsonb('details').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('economy_audit_character_idx').on(table.characterId)],
);

export const chatModeration = pgTable('chat_moderation', {
  id: uuid('id').primaryKey(),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  excerpt: text('excerpt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
