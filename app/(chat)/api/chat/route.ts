import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  generateEmbedding,
  smoothStream,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, getSystemPrompt } from '@/lib/ai/prompts'; // Changed systemPrompt to getSystemPrompt
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
  recordUsage,
  sumTokenUsageForUserInLast24h,
  saveMemory,
  getRelevantMemories,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new Response('Invalid request body', { status: 400 });
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userType: UserType = session.user.type;

    // Check token usage against daily limit
    const tokensUsedToday = await sumTokenUsageForUserInLast24h(session.user.id);
    const dailyTokenLimit = entitlementsByUserType[userType].maxTokensPerDay;

    if (tokensUsedToday >= dailyTokenLimit) {
      return new Response(
        `You have exceeded your daily token limit (${dailyTokenLimit} tokens). Please try again later.`,
        {
          status: 429,
        },
      );
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    // Generate and save embedding for the user's message
    if (session.user.id && message.parts) {
      const userMessageContent = message.parts
        .filter(part => part.type === 'text')
        .map(part => (part as { type: 'text'; text: string }).text)
        .join('\n');

      if (userMessageContent.trim().length > 0) {
        try {
          const embeddingModel = myProvider.embeddingModel(
            process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
          );
          const { embedding } = await generateEmbedding({
            model: embeddingModel,
            value: userMessageContent,
          });
          await saveMemory({
            userId: session.user.id,
            content: userMessageContent,
            embedding,
          });
        } catch (embeddingError) {
          console.error('Error generating or saving memory embedding:', embeddingError);
          // Decide if this error should halt execution or just be logged.
          // For now, just logging.
        }
      }
    }

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // --- BEGIN Memory Retrieval and Prompt Augmentation ---
    // Fetch base system prompt (potentially from DB with caching)
    let baseSystemPromptText = await getSystemPrompt({ selectedChatModel, requestHints });
    let finalSystemPrompt = baseSystemPromptText; // Initialize finalSystemPrompt with the base

    if (session.user.id && message.parts) {
      const userQueryText = message.parts
        .filter(part => part.type === 'text')
        .map(part => (part as { type: 'text'; text: string }).text)
        .join('\n');

      if (userQueryText.trim().length > 0) {
        try {
          const embeddingModel = myProvider.embeddingModel(
            process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
          );
          const { embedding: queryEmbedding } = await generateEmbedding({
            model: embeddingModel,
            value: userQueryText,
          });

          const relevantMemoryContents = await getRelevantMemories({
            userId: session.user.id,
            queryEmbedding,
            limit: 5, // Configurable limit
          });

          if (relevantMemoryContents.length > 0) {
            const memoryBlock = "Relevant past conversations (ignore if not relevant to the current query):\n" +
                                relevantMemoryContents.map(mem => `- ${mem}`).join("\n");
            // baseSystemPromptText is already fetched and contains the full prompt including request hints and artifact logic
            finalSystemPrompt = `${baseSystemPromptText}\n\n${memoryBlock}`;
          }
          // If no relevant memories, finalSystemPrompt remains baseSystemPromptText
        } catch (memoryError) {
          console.error('Error retrieving or processing memories:', memoryError);
          // Fallback to base system prompt already assigned
        }
      }
    }
    // --- END Memory Retrieval and Prompt Augmentation ---

    const stream = createDataStream({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: finalSystemPrompt, // Use the potentially augmented system prompt
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response }) => {
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [message],
                  responseMessages: response.messages,
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });

                // Record token usage
                const { promptTokens = 0, completionTokens = 0 } = response.usage ?? {};
                if (session.user.id && id) { // id is chatId here
                  await recordUsage({
                    userId: session.user.id,
                    chatId: id,
                    promptTokens,
                    completionTokens,
                  });
                }

              } catch (error) { // Changed _ to error to potentially log it if needed
                console.error('Error in onFinish callback (saving message or recording usage):', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      return new Response(stream);
    }
  } catch (_) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('id is required', { status: 400 });
  }

  const session = await auth();

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new Response('Not found', { status: 404 });
  }

  if (!chat) {
    return new Response('Not found', { status: 404 });
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new Response('No streams found', { status: 404 });
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new Response('No recent stream found', { status: 404 });
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
