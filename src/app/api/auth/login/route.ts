import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import {
  SESSION_COOKIE_NAME,
  buildSessionForEmail,
  encodeSessionCookie,
} from '@/lib/auth/session';
import { readDatabase } from '@/lib/db/store';

const LoginSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = LoginSchema.parse(await req.json());
    const db = await readDatabase();
    const session = buildSessionForEmail(body.email, db);
    if (!session) {
      return NextResponse.json(
        { error: `Unknown demo identity: ${body.email}` },
        { status: 404 }
      );
    }

    const res = NextResponse.json({ session, ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookie(session.email), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}

