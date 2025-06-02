import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
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
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('google-gemini-2.5-flash'),
        'chat-model-reasoning': wrapLanguageModel({
          model: xai('google-gemini-2.5-flash'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': xai('google-gemini-2.5-flash'),
        'artifact-model': xai('google-gemini-2.5-flash'),
      },
      // Keeping imageModels as is, assuming it's not part of this change.
      // If it should be removed, I'll need further clarification.
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
