'use client';

import React from 'react';
import type { TransactionStatus } from '@/lib/db/types';
import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pt-5 pb-3 border-b border-slate-100', className)}>
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'paytm'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'success'
    | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary:
      'bg-[#002970] text-white hover:bg-[#001f57] shadow-sm disabled:bg-slate-300',
    paytm:
      'bg-[#00BAF2] text-[#002970] font-semibold hover:bg-[#00a6d9] shadow-sm disabled:bg-slate-200 disabled:text-slate-400',
    secondary:
      'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:opacity-50',
    outline:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50',
    ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    success:
      'bg-[#00B86B] text-white hover:bg-[#009c5a] shadow-sm disabled:bg-slate-300',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-slate-300',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'h-8 px-3 text-xs rounded-lg',
    md: 'h-10 px-4 text-sm rounded-xl',
    lg: 'h-12 px-6 text-base rounded-xl',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  variant = 'default',
  className,
  children,
}: {
  variant?: 'default' | 'blue' | 'navy' | 'green' | 'amber' | 'red' | 'purple';
  className?: string;
  children: React.ReactNode;
}) {
  const styles = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-sky-50 text-sky-700 border-sky-200',
    navy: 'bg-[#002970]/10 text-[#002970] border-[#002970]/20',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    purple: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00BAF2] focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00BAF2] focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20',
        className
      )}
      {...props}
    />
  );
}

export function TransactionStatusBadge({
  status,
}: {
  status: TransactionStatus;
}) {
  const greenStates: TransactionStatus[] = [
    'MANDATE_AUTHORISED',
    'CARD_PAYMENT_SUCCESS',
    'ORDER_CREATED',
    'INVOICE_VERIFIED',
    'DELIVERED',
    'SETTLEMENT_ELIGIBLE',
    'SETTLEMENT_COMPLETED',
  ];
  const redStates: TransactionStatus[] = [
    'CANCELLED',
    'MANDATE_REJECTED',
    'MANDATE_EXPIRED',
    'PAYMENT_FAILED',
    'VERIFICATION_FAILED',
    'DISPUTED',
  ];
  const amberStates: TransactionStatus[] = [
    'PROVIDER_MATCHING',
    'MANDATE_PENDING',
    'CARD_PAYMENT_PENDING',
    'INVOICE_PENDING',
    'INVOICE_UNDER_REVIEW',
    'RETURN_WINDOW_ACTIVE',
    'REFUND_PENDING',
  ];

  const variant = greenStates.includes(status)
    ? 'green'
    : redStates.includes(status)
    ? 'red'
    : amberStates.includes(status)
    ? 'amber'
    : 'blue';

  return <Badge variant={variant}>{status.replace(/_/g, ' ')}</Badge>;
}

