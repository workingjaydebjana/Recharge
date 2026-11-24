'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import DashboardView from '@/components/user/DashboardView.jsx';

export default function DashboardPage() {
  const { meData, openAddBalance, raiseComplaint } = usePortal();

  return (
    <DashboardView
      user={meData.user}
      wallet={meData.wallet}
      settings={meData.settings}
      commissions={meData.commissions}
      summary={meData.summary}
      recentTransactions={meData.recentTransactions}
      onOpenAddBalance={openAddBalance}
      onRaiseComplaint={raiseComplaint}
    />
  );
}
