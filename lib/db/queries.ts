import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
  token_usage,
  memories,
  admin_prompts,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from './utils';
import type { VisibilityType } from '@/components/visibility-selector';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    throw error;
  }
}

export async function updateAdminPrompt(
  promptId: string,
  { text, isActive, incrementVersion }: { text?: string; isActive?: boolean; incrementVersion?: boolean }
): Promise<AdminPrompt | null> {
  try {
    const updatedPrompt = await db.transaction(async (tx) => {
      if (isActive === true) {
        // If this prompt is being set to active, deactivate all others.
        await tx
          .update(admin_prompts)
          .set({ active: false })
          .where(eq(admin_prompts.active, true));
      }

      const updateData: Partial<{ text: string; active: boolean; version: SQL }> = {};
      if (text !== undefined) {
        updateData.text = text;
      }
      if (isActive !== undefined) {
        updateData.active = isActive;
      }
      if (incrementVersion === true) {
        updateData.version = sql`${admin_prompts.version} + 1`;
      }

      if (Object.keys(updateData).length === 0) {
        // Nothing to update, fetch the current record
        const currentPrompt = await tx
          .select()
          .from(admin_prompts)
          .where(eq(admin_prompts.id, promptId))
          .limit(1);
        return currentPrompt[0] || null;
      }

      // Also update `createdAt` to reflect modification time, or add an `updatedAt` field
      // For now, Drizzle doesn't auto-update timestamps on general updates unless specified.
      // Let's assume version increment implies an update. If only 'active' changes, version might not.
      // The prompt asks for version increment if text changes, or if incrementVersion is true.

      const [result] = await tx
        .update(admin_prompts)
        .set(updateData)
        .where(eq(admin_prompts.id, promptId))
        .returning();

      return result;
    });

    if (!updatedPrompt) return null;

    return {
      id: updatedPrompt.id,
      text: updatedPrompt.text,
      active: updatedPrompt.active,
      version: updatedPrompt.version,
      createdAt: updatedPrompt.createdAt, // This is original creation, consider adding updatedAt
      createdBy: updatedPrompt.createdBy,
    };

  } catch (error) {
    console.error(`Failed to update admin prompt ${promptId}:`, error);
    throw error;
  }
}

export async function deleteAdminPrompt(promptId: string): Promise<AdminPrompt | null> {
  try {
    const [deletedPrompt] = await db
      .delete(admin_prompts)
      .where(eq(admin_prompts.id, promptId))
      .returning();

    if (!deletedPrompt) return null;

    return {
      id: deletedPrompt.id,
      text: deletedPrompt.text,
      active: deletedPrompt.active,
      version: deletedPrompt.version,
      createdAt: deletedPrompt.createdAt,
      createdBy: deletedPrompt.createdBy,
    };
  } catch (error) {
    console.error(`Failed to delete admin prompt ${promptId}:`, error);
    throw error;
  }
}

// Interface for Admin Prompt data returned by API/queries
export interface AdminPrompt {
  id: string;
  text: string;
  active: boolean;
  version: number;
  createdAt: Date;
  createdBy: string | null; // Assuming createdBy can be null or string (UUID)
}

export async function getAllAdminPrompts(): Promise<AdminPrompt[]> {
  try {
    const prompts = await db
      .select({
        id: admin_prompts.id,
        text: admin_prompts.text,
        active: admin_prompts.active,
        version: admin_prompts.version,
        createdAt: admin_prompts.createdAt,
        createdBy: admin_prompts.createdBy,
      })
      .from(admin_prompts)
      .orderBy(desc(admin_prompts.createdAt));
    return prompts;
  } catch (error) {
    console.error('Failed to get all admin prompts from database:', error);
    throw error; // Re-throw to be handled by the API route
  }
}

export async function createAdminPrompt({
  text,
  userId,
  isActive = false,
}: {
  text: string;
  userId: string;
  isActive?: boolean;
}): Promise<AdminPrompt> {
  try {
    const newPrompt = await db.transaction(async (tx) => {
      if (isActive) {
        // Set all other prompts to inactive
        await tx
          .update(admin_prompts)
          .set({ active: false })
          .where(eq(admin_prompts.active, true));
      }

      // Insert the new prompt
      // Version is handled by default in schema (default 1)
      const [insertedPrompt] = await tx
        .insert(admin_prompts)
        .values({
          text,
          createdBy: userId,
          active: isActive,
          // version will use its default if not specified, or you can set it explicitly.
          // For simplicity, relying on DB default for version 1 on new prompts here.
        })
        .returning();

      return insertedPrompt;
    });
    // Ensure the returned object matches the AdminPrompt interface, especially if .returning() gives more/less
    return {
        id: newPrompt.id,
        text: newPrompt.text,
        active: newPrompt.active,
        version: newPrompt.version,
        createdAt: newPrompt.createdAt,
        createdBy: newPrompt.createdBy,
    };
  } catch (error) {
    console.error('Failed to create admin prompt in database:', error);
    throw error; // Re-throw to be handled by the API route
  }
}

export async function getActiveAdminPrompt(): Promise<{ text: string; version: number } | null> {
  try {
    const results = await db
      .select({
        text: admin_prompts.text,
        version: admin_prompts.version,
      })
      .from(admin_prompts)
      .where(eq(admin_prompts.active, true))
      .orderBy(desc(admin_prompts.createdAt)) // Pick the latest if multiple are active
      .limit(1);

    if (results.length > 0) {
      return results[0];
    }
    return null;
  } catch (error) {
    console.error('Failed to get active admin prompt from database:', error);
    // Depending on criticality, you might re-throw or handle differently.
    // For now, returning null and logging error.
    return null;
  }
}

export async function getRelevantMemories({
  userId,
  queryEmbedding,
  limit = 5,
}: {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
}): Promise<string[]> {
  try {
    // Convert the query embedding array to the string format pgvector expects, e.g., '[0.1,0.2,...]'
    const embeddingString = JSON.stringify(queryEmbedding);

    // Construct the SQL for ordering by vector cosine distance.
    // We explicitly cast the input string to VECTOR.
    // The column memories.embedding is already defined as vector(1536) via customType,
    // so it should not need explicit casting on the column side for the operator to work.
    const orderByDistance = sql`${memories.embedding} <-> CAST(${embeddingString} AS VECTOR)`;

    const results = await db
      .select({ content: memories.content })
      .from(memories)
      .where(eq(memories.user_id, userId))
      .orderBy(orderByDistance)
      .limit(limit);

    return results.map(row => row.content);

  } catch (error) {
    console.error('Error retrieving relevant memories:', error);
    return []; // Return empty array on error as per requirements
  }
}

export async function saveMemory({
  userId,
  content,
  embedding,
}: {
  userId: string;
  content: string;
  embedding: number[];
}) {
  try {
    await db.insert(memories).values({
      user_id: userId,
      content: content,
      embedding: JSON.stringify(embedding), // Store as string '[0.1,0.2,...]'
      // id and created_at have default values
    });
    // console.log('Memory saved successfully.'); // Optional
  } catch (error) {
    console.error('Error saving memory:', error);
    // Not re-throwing, as this is often a background task.
  }
}

export interface TokenUsageRow {
  email: string | null; // email can be null if user somehow deleted but usage exists
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

export async function getTokenUsagePerUserToday(): Promise<Array<TokenUsageRow>> {
  try {
    // Note: date_trunc and interval are PostgreSQL specific.
    // current_timestamp is standard SQL.
    const result = await db.execute(sql`
      SELECT
        ${user.email},
        SUM(${token_usage.prompt_tokens}) AS total_prompt_tokens,
        SUM(${token_usage.completion_tokens}) AS total_completion_tokens,
        SUM(${token_usage.prompt_tokens} + ${token_usage.completion_tokens}) AS total_tokens
      FROM ${token_usage}
      JOIN ${user} ON ${token_usage.user_id} = ${user.id}
      WHERE ${token_usage.created_at} >= date_trunc('day', current_timestamp)
        AND ${token_usage.created_at} < date_trunc('day', current_timestamp) + interval '1 day'
      GROUP BY ${user.id}, ${user.email}
      ORDER BY total_tokens DESC
    `);

    // Assuming result.rows contains the data directly typed.
    // Need to parse numbers as they might come back as strings from some drivers with raw queries.
    return result.rows.map((row: any) => ({
      email: row.email,
      total_prompt_tokens: parseInt(row.total_prompt_tokens, 10) || 0,
      total_completion_tokens: parseInt(row.total_completion_tokens, 10) || 0,
      total_tokens: parseInt(row.total_tokens, 10) || 0,
    }));
  } catch (error) {
    console.error('Failed to get token usage per user for today:', error);
    throw error; // Re-throw to be handled by the API route
  }
}

export async function sumTokenUsageForUserInLast24h(userId: string): Promise<number> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    //
    // IMPORTANT: The `token_usage.prompt_tokens + token_usage.completion_tokens` expression
    // below is specific to PostgreSQL. Other SQL databases might require different syntax
    // for casting or concatenation.
    //
    // Also, using template strings for column names directly in `sql` from `drizzle-orm`
    // is generally safe as Drizzle's `sql` template tag handles SQL injection for values.
    // However, column names are typically static.
    //
    // A more Drizzle-idiomatic way to sum two columns if `sum` aggregator supported expressions
    // or if we had a `total_tokens` column would be preferred.
    // For now, this raw SQL approach for the sum of two columns is used as per prompt's hint.
    //
    const result = await db.execute(sql`
      SELECT SUM(${token_usage.prompt_tokens} + ${token_usage.completion_tokens}) as total_tokens
      FROM ${token_usage}
      WHERE ${token_usage.user_id} = ${userId} AND ${token_usage.created_at} >= ${twentyFourHoursAgo}
    `);

    // The result from db.execute with raw SQL might vary based on the driver.
    // For 'postgres' (node-postgres), it's usually an object with a 'rows' array.
    // Let's assume it returns something like { rows: [{ total_tokens: '123' }] } or [{ total_tokens: '123' }]
    // and that total_tokens might be a string that needs parsing.
    if (result.rows && result.rows.length > 0 && result.rows[0].total_tokens) {
      return parseInt(result.rows[0].total_tokens, 10);
    }
    return 0; // Default to 0 if no usage or no records found
  } catch (error) {
    console.error('Failed to sum token usage for user in last 24h:', error);
    // It's crucial to decide if this should throw or return 0.
    // Returning 0 might let a user exceed their limit if the query fails.
    // Throwing might block users if the DB has issues.
    // For now, returning 0 and logging error. Consider implications.
    return 0;
  }
}

export async function recordUsage({
  userId,
  promptTokens,
  completionTokens,
  chatId,
}: {
  userId: string;
  promptTokens: number;
  completionTokens: number;
  chatId:string;
}) {
  try {
    await db.insert(token_usage).values({
      user_id: userId,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      chat_id: chatId,
      // id and created_at have default values in the schema
    });
    // console.log('Token usage recorded successfully.'); // Optional: for debugging
  } catch (error) {
    console.error('Error recording token usage:', error);
    // Not re-throwing, as this is often a background task and shouldn't fail the main operation.
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    console.error('Failed to create guest user in database');
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${startingAfter} not found`);
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${endingBefore} not found`);
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    console.error(
      'Failed to get message count by user id for the last 24 hours from database',
    );
    throw error;
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    console.error('Failed to create stream id in database');
    throw error;
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    console.error('Failed to get stream ids by chat id from database');
    throw error;
  }
}
