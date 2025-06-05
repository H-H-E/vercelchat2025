import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  getAllAdminPrompts,
  createAdminPrompt,
  type AdminPrompt // Assuming AdminPrompt interface is exported from queries.ts
} from '@/lib/db/queries';
import { invalidateActivePromptCache } from '@/lib/ai/prompts';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const prompts: AdminPrompt[] = await getAllAdminPrompts();
    return NextResponse.json(prompts);

  } catch (error) {
    console.error('API GET /admin/prompts Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { text, isActive = false } = body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return NextResponse.json({ error: 'Prompt text is required' }, { status: 400 });
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
    }

    const newPrompt: AdminPrompt = await createAdminPrompt({
      text: text.trim(),
      userId: session.user.id,
      isActive
    });

    if (isActive) {
      invalidateActivePromptCache();
    }

    return NextResponse.json(newPrompt, { status: 201 });

  } catch (error) {
    console.error('API POST /admin/prompts Error:', error);
    // Check for specific errors from createAdminPrompt if needed, e.g., unique constraint
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
