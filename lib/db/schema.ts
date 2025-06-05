import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
  integer,
  customType,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  'Stream',
  {
    id: uuid('id').notNull().defaultRandom(),
    chatId: uuid('chatId').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;

export const admin_prompts = pgTable('admin_prompts', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  text: text('text').notNull(),
  active: boolean('active').default(false).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  createdBy: uuid('createdBy').references(() => user.id), // Assuming 'user' is the name of your users table
});

export const token_usage = pgTable('token_usage', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  user_id: uuid('user_id').references(() => user.id).notNull(),
  chat_id: uuid('chat_id'), // Nullable, as usage might not always be tied to a specific chat
  prompt_tokens: integer('prompt_tokens').default(0).notNull(),
  completion_tokens: integer('completion_tokens').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Custom type for pgvector's vector type
// This defines the SQL data type; actual to/from driver conversion might need more handling
// for direct Drizzle ORM operations if it involves complex parsing/formatting.
// For schema generation, specifying dataType is the key.
const vectorColumn = customType<{ data: number[], dimensions?: number, name?: string }>({
  dataType(config) {
    // config contains { dimensions, name } if you pass them to vectorColumn instance
    // For pgvector, the type is vector(dimensions)
    // config.dimensions should be passed when using vectorColumn, e.g., vectorColumn('embedding', { dimensions: 1536 })
    return `vector(${config?.dimensions ?? 1536})`; // Default to 1536 if not specified, though it should be.
  },
  // toDriver(value: number[]): string {
  //   // pgvector from 'pgvector' package has a helper: pgvector.toSql(value)
  //   // For now, just stringifying, assuming direct use or migration generation focus.
  //   return JSON.stringify(value);
  // },
  // fromDriver(value: string): number[] {
  //   // return JSON.parse(value); // Simplistic, actual format is '[1,2,3]'
  // }
});


export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  user_id: uuid('user_id').references(() => user.id).notNull(),
  content: text('content').notNull(),
  embedding: vectorColumn('embedding', { dimensions: 1536 }).notNull(), // Specify dimensions here
  created_at: timestamp('created_at').defaultNow().notNull(),
});
