import { cookies } from 'next/headers';
import { readDatabase } from '@/lib/db/store';
import type { User, UserRole } from '@/lib/db/types';

export const SESSION_COOKIE_NAME = 'perklink_demo_session';

export interface DemoSession {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  providerId?: string;
}

export const DEMO_IDENTITIES: Array<{
  email: string;
  role: UserRole;
  label: string;
  subtitle: string;
}> = [
  {
    email: 'shopper@perklink.demo',
    role: 'SHOPPER_B',
    label: 'Class B — Shopper',
    subtitle: 'Rahul Sharma • Discover offers, save via AI & approve UPI mandate',
  },
  {
    email: 'provider@perklink.demo',
    role: 'PROVIDER_A',
    label: 'Class A — Card Provider',
    subtitle: 'Arjun Mehta • SBI Cashback •••• 4387 • Accept requests & earn ₹250',
  },
  {
    email: 'admin@perklink.demo',
    role: 'ADMIN_OPS',
    label: 'Paytm Operations — Admin',
    subtitle: 'Operations Desk • Review mismatches, delivery & simulate settlement',
  },
];

export async function getActiveSession(): Promise<DemoSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await readDatabase();

  let email = 'shopper@perklink.demo';
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as {
        email?: string;
      };
      if (parsed.email) email = parsed.email;
    } catch {
      // ignore invalid cookie, fall back to default demo identity
    }
  } else {
    return null;
  }

  return buildSessionForEmail(email, db);
}

export async function getRequiredSession(
  allowedRoles?: UserRole[]
): Promise<DemoSession> {
  let session = await getActiveSession();
  if (!session) {
    const db = await readDatabase();
    session = buildSessionForEmail('shopper@perklink.demo', db);
  }
  if (!session) {
    throw new Error('User not found in database.');
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new AuthError(
      `Action requires role ${allowedRoles.join(' or ')}, but active identity is ${session.role}.`,
      403
    );
  }
  return session;
}

export function buildSessionForEmail(
  email: string,
  db: Awaited<ReturnType<typeof readDatabase>>
): DemoSession | null {
  const user: User | undefined = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user) return null;

  const roleRecord = db.userRoles.find((r) => r.userId === user.id);
  const role: UserRole = roleRecord?.role ?? 'SHOPPER_B';
  const provider = db.providerProfiles.find((p) => p.userId === user.id);

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role,
    providerId: provider?.id,
  };
}

export function encodeSessionCookie(email: string): string {
  return Buffer.from(JSON.stringify({ email }), 'utf-8').toString('base64url');
}

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

