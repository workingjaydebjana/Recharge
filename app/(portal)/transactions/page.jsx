'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePortal } from '@/components/PortalShell.jsx';
import TransactionsView from '@/components/user/TransactionsView.jsx';

function TransactionsContent() {
  const searchParams = useSearchParams();
  const { token, meData, raiseComplaint } = usePortal();
  const initialStatus = searchParams.get('status') || 'ALL';

  return (
    <TransactionsView
      token={token}
      initialStatus={initialStatus}
      initialTransactions={meData.recentTransactions}
      onRaiseComplaint={raiseComplaint}
    />
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsContent />
    </Suspense>
  );
}
