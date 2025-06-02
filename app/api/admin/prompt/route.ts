import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getMasterPrompt, updateMasterPrompt } from '@/lib/db/queries';

export async function GET(request: Request) {
  const session = await auth();

  if (!session || session.user?.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const masterPrompt = await getMasterPrompt();
    if (masterPrompt) {
      return NextResponse.json({ promptText: masterPrompt.promptText });
    }
    return NextResponse.json({ error: 'Master prompt not found' }, { status: 404 });
  } catch (error) {
    console.error('Error fetching master prompt:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session || session.user?.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { promptText } = body;

    if (typeof promptText !== 'string' || promptText.trim() === '') {
      return NextResponse.json({ error: 'Prompt text is required' }, { status: 400 });
    }

    const updatedPrompt = await updateMasterPrompt(promptText.trim());
    if (updatedPrompt && updatedPrompt.length > 0) {
      return NextResponse.json(updatedPrompt[0]);
    }
    return NextResponse.json({ error: 'Failed to update master prompt' }, { status: 500 });
  } catch (error) {
    console.error('Error updating master prompt:', error);
    // Check if the error is due to invalid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
