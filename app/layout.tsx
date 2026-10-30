import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AQUA BOAT GRAND PRIX ONLINE',
  description: 'みんなで遊ぶ無料メダル制オンラインボートレース',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
