import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
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
      className={inter.variable}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          referrerPolicy="no-referrer"
        />
      </head>
      <body
        suppressHydrationWarning
        className="font-sans antialiased bg-[#F7F7FC] text-[#0E163B] selection:bg-[#5B35E5]/15 selection:text-[#0E163B]"
      >
        {children}
      </body>
    </html>
  );
}
