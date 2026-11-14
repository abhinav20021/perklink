import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/session';
import { StateTransitionError } from '@/lib/state-machine/transaction-fsm';

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof StateTransitionError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.flatten() },
      { status: 400 }
    );
  }
  const message =
    error instanceof Error ? error.message : 'Unexpected server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

