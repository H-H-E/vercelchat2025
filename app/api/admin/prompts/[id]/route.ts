import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  updateAdminPrompt,
  deleteAdminPrompt,
  type AdminPrompt
} from '@/lib/db/queries';
import { invalidateActivePromptCache } from '@/lib/ai/prompts';

interface RouteParams {
  params: { id: string };
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user || session.user.type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const promptId = params.id;
    const body = await request.json();
    const { text, isActive } = body;

    // Basic validation: at least one field to update should be present
    if (text === undefined && isActive === undefined) {
      return NextResponse.json({ error: 'No update fields provided (text or isActive)' }, { status: 400 });
    }
    if (text !== undefined && (typeof text !== 'string' || text.trim() === '')) {
        return NextResponse.json({ error: 'Prompt text cannot be empty' }, { status: 400 });
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
    }

    // Determine if version should be incremented:
    // For this implementation, we'll say version increments if text is being updated.
    // Or, a more explicit 'incrementVersion' flag could be sent by the client.
    const incrementVersion = text !== undefined;

    const updatedPromptData: Partial<{ text?: string; isActive?: boolean; incrementVersion?: boolean }> = {};
    if (text !== undefined) updatedPromptData.text = text.trim();
    if (isActive !== undefined) updatedPromptData.isActive = isActive;
    if (incrementVersion) updatedPromptData.incrementVersion = true;


    const updatedPrompt: AdminPrompt | null = await updateAdminPrompt(promptId, updatedPromptData);

    if (!updatedPrompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    // Invalidate cache if the active status could have changed
    // This includes setting a prompt to active, or setting the currently active prompt to inactive.
    if (isActive !== undefined) {
      invalidateActivePromptCache();
    }

    return NextResponse.json(updatedPrompt);

  } catch (error) {
    console.error(`API PUT /admin/prompts/${params.id} Error:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user || session.user.type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const promptId = params.id;
    const deletedPrompt: AdminPrompt | null = await deleteAdminPrompt(promptId);

    if (!deletedPrompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    // If the deleted prompt was active, or just to be safe for any deletion, invalidate cache.
    // The system will fall back to default if the active one is deleted and cache is cleared.
    invalidateActivePromptCache();

    return NextResponse.json({ message: `Prompt ${promptId} deleted successfully`, deletedPrompt });

  } catch (error) {
    console.error(`API DELETE /admin/prompts/${params.id} Error:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
