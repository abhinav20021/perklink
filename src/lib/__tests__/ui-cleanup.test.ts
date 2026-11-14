import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('UI Cleanup & Terminology Standardisation', () => {
  it('ensures no user-facing occurrences of Class A or Class B remain in TSX/TS files', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const files: string[] = [];

    function collectFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (entry.name.endsWith('.tsx') || (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))) {
          files.push(fullPath);
        }
      }
    }

    collectFiles(path.join(srcDir, 'app'));
    collectFiles(path.join(srcDir, 'components'));

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/\bClass A\b/);
      expect(content).not.toMatch(/\bClass B\b/);
    }
  });

  it('ensures Next Step section is completely removed from /shopper/mandate', () => {
    const mandatePage = path.resolve(__dirname, '../../app/shopper/mandate/page.tsx');
    const content = fs.readFileSync(mandatePage, 'utf-8');

    expect(content).not.toContain('Next Step');
    expect(content).toContain('Mandate Successfully Authorised!');
    expect(content).toContain('Go to Shopper Dashboard');
    expect(content).toContain('View My Orders');
  });

  it('ensures optional invoice upload is completely removed from /provider/payment', () => {
    const paymentPage = path.resolve(__dirname, '../../app/provider/payment/page.tsx');
    const content = fs.readFileSync(paymentPage, 'utf-8');

    expect(content).not.toContain('Optional Fallback Invoice Upload');
    expect(content).not.toContain('/provider/upload-invoice');
    expect(content).not.toContain('Invoice Upload');
  });
});
