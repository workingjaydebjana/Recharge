import '@fortawesome/fontawesome-free/css/all.min.css';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'Quick Recharge — Indian Mobile, DTH & Redeem Code Recharge Platform',
  description:
    'Production-oriented Indian Recharge Platform for Mobile Recharge, DTH Recharge, and Redeem Codes with a three-balance wallet ledger, automatic commission engine, and centralized Super Admin panel.',
  openGraph: {
    title: 'Quick Recharge — Indian Recharge Platform',
    description:
      'Mobile Recharge, DTH Recharge, and Redeem Code platform with three-balance wallet ledger and Super Admin controls.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="font-sans antialiased bg-[#F7F7FC] text-[#0E163B] selection:bg-[#5B35E5]/15 selection:text-[#0E163B]"
      >
        {children}
      </body>
    </html>
  );
}
