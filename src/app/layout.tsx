import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Paytm PerkLink — AI Offer Intelligence & Card Match Orchestration',
  description:
    'PerkLink uses AI to understand bank offers, discover the best savings opportunity, and match shoppers with eligible card providers. Hackathon Simulation MVP.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F4F7FB] text-slate-900">
        {children}
      </body>
    </html>
  );
}
