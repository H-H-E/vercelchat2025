import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { openai } from '@ai-sdk/openai'; // New import
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
      embeddingModels: { // Added for test environment
        'text-embedding-3-small': {
          doEmbed: async () => ({ embedding: [0.1, 0.2, 0.3] }), // Mock behavior
          maxTokens: 8192, // Example value
          dimensions: 1536, // Example value
        } as any, // Cast to any to satisfy the type if mock is simplified
      }
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-2-vision-1212'),
        'chat-model-reasoning': wrapLanguageModel({
          model: xai('grok-3-mini-beta'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': xai('grok-2-1212'),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
      embeddingModels: { // Added for non-test environment
        [process.env.EMBEDDING_MODEL || 'text-embedding-3-small']: openai.embedding(
          process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
        ),
      },
    });
