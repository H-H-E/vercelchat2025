import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getTokenUsagePerUserToday, type TokenUsageRow } from '@/lib/db/queries';

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const tokenUsageData: Array<TokenUsageRow> = await getTokenUsagePerUserToday();
    return NextResponse.json(tokenUsageData, { status: 200 });
  } catch (error) {
    console.error('API Error fetching token usage:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
