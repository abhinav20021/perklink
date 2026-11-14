'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileSearch,
  Home,
  Inbox,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { UserRole } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { Badge, Button } from '@/components/ui/primitives';

interface SessionInfo {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  providerId?: string;
}

const ROLE_NAV: Record<
  UserRole,
  Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>
> = {
  SHOPPER_B: [
    { href: '/shopper', label: 'Dashboard', icon: Home },
    { href: '/shopper/new-purchase', label: 'AI Analyse', icon: Sparkles },
    { href: '/shopper/offers', label: 'AI Offers & Match', icon: Tag },
    { href: '/shopper/mandate', label: 'UPI Mandate', icon: Wallet },
    { href: '/shopper/orders', label: 'Orders', icon: Package },
  ],
  PROVIDER_A: [
    { href: '/provider', label: 'Dashboard', icon: Home },
    { href: '/provider/requests', label: 'Requests', icon: Inbox },
    { href: '/provider/payment', label: 'Card Checkout', icon: CreditCard },
    { href: '/provider/upload-invoice', label: 'Fallback Invoice', icon: FileSearch },
  ],
  ADMIN_OPS: [
    { href: '/admin', label: 'Ops Overview', icon: Activity },
    { href: '/admin/verification', label: 'Mismatches', icon: FileSearch },
    { href: '/admin/transactions', label: 'Lifecycle & Settle', icon: CheckCircle2 },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  ],
};

const PERSONAS: Array<{ email: string; role: UserRole; short: string; defaultPath: string }> = [
  {
    email: 'shopper@perklink.demo',
    role: 'SHOPPER_B',
    short: 'Class B: Shopper',
    defaultPath: '/shopper',
  },
  {
    email: 'provider@perklink.demo',
    role: 'PROVIDER_A',
    short: 'Class A: Provider',
    defaultPath: '/provider',
  },
  {
    email: 'admin@perklink.demo',
    role: 'ADMIN_OPS',
    short: 'Paytm Ops Admin',
    defaultPath: '/admin',
  },
];

export function AppShell({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [switching, setSwitching] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (active && d.session) setSession(d.session);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  async function switchPersona(email: string, redirectPath?: string) {
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        if (redirectPath) {
          router.push(redirectPath);
        }
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  async function handleResetDemo() {
    setResetting(true);
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      router.refresh();
      window.location.reload();
    } finally {
      setResetting(false);
    }
  }

  const activeRole: UserRole =
    requiredRole ?? session?.role ?? 'SHOPPER_B';
  const navItems = ROLE_NAV[activeRole];
  const roleMismatch =
    Boolean(requiredRole && session && session.role !== requiredRole);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB]">
      {/* Persistent Simulation Compliance Bar */}
      <div className="bg-[#002970] text-white text-xs px-4 py-1.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#00BAF2] px-2.5 py-0.5 text-[11px] font-bold text-[#002970]">
              <ShieldCheck className="h-3 w-3" />
              SIMULATION MODE — NO REAL MONEY MOVES
            </span>
            <span className="hidden md:inline text-sky-100">
              Paytm Build for India AI Hackathon MVP • Synthetic Cards, Simulated UPI Mandate & Escrow
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-medium transition cursor-pointer"
            >
              <RefreshCw className={cn('h-3 w-3', resetting && 'animate-spin')} />
              {resetting ? 'Resetting...' : 'Reset Environment'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Paytm-inspired Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#002970] to-[#00BAF2] flex items-center justify-center text-white font-black text-base shadow-sm">
                P
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-[#002970] text-lg tracking-tight">
                    Paytm
                  </span>
                  <span className="font-bold text-[#00BAF2] text-lg tracking-tight">
                    PerkLink
                  </span>
                </div>
                <p className="text-[10px] font-medium text-slate-500 hidden sm:block">
                  AI Offer Intelligence & Card Match
                </p>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition',
                      active
                        ? 'bg-[#002970] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Role Switcher */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              {PERSONAS.map((p) => {
                const isActive = session?.role === p.role;
                return (
                  <button
                    key={p.email}
                    disabled={switching}
                    onClick={() => switchPersona(p.email, p.defaultPath)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
                      isActive
                        ? 'bg-white text-[#002970] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {p.short}
                  </button>
                );
              })}
            </div>
            {session && (
              <Badge variant="blue" className="hidden md:inline-flex">
                <UserCheck className="h-3 w-3" />
                {session.fullName}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Role Mismatch Banner (guides judge to switch cleanly in 1 click) */}
      {roleMismatch && requiredRole && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <span>
              You are viewing a <strong>{requiredRole.replace('_', ' ')}</strong> route while logged in as{' '}
              <strong>{session?.email?.replace('.demo', '.in')}</strong>. Switch role to perform actions on this page.
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const target = PERSONAS.find((p) => p.role === requiredRole);
                if (target) switchPersona(target.email);
              }}
            >
              Switch to {PERSONAS.find((p) => p.role === requiredRole)?.short}
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 lg:pb-10">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold',
                active ? 'text-[#002970]' : 'text-slate-500'
              )}
            >
              <Icon className={cn('h-4 w-4', active && 'text-[#00BAF2]')} />
              <span className="truncate max-w-[68px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

