'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import DthRechargeView from '@/components/user/DthRechargeView.jsx';

export default function DthRechargePage() {
  const { token, meData, refreshMe, raiseComplaint } = usePortal();

  return (
    <DthRechargeView
      token={token}
      wallet={meData.wallet}
      settings={meData.settings}
      commissions={meData.commissions}
      recentTransactions={meData.recentTransactions}
      onSuccessRefresh={refreshMe}
      onRaiseComplaint={raiseComplaint}
    />
  );
}
