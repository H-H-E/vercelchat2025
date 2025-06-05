import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxTokensPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  student: {
    maxTokensPerDay: 1000,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For users with an account
   */
  regular: {
    maxTokensPerDay: 20000,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For admin users
   */
  admin: {
    maxTokensPerDay: 100_000_000, // Effectively very high
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
