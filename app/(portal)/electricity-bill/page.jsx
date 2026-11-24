'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import ElectricityBillView from '@/components/user/ElectricityBillView.jsx';

export default function ElectricityBillPage() {
  const { token, meData, refreshMe, raiseComplaint } = usePortal();

  return (
    <ElectricityBillView
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
