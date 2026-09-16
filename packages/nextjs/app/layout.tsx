import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Provenance Swarm — verifiable supply-chain provenance on Hedera',
  description:
    'A Scaffold-HBAR template: deterministic agent swarm verifies provenance claims, anchors receipts on Hedera.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}