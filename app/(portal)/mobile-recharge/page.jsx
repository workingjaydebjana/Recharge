'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import MobileRechargeView from '@/components/user/MobileRechargeView.jsx';

export default function MobileRechargePage() {
  const { token, meData, refreshMe, raiseComplaint } = usePortal();

  return (
    <MobileRechargeView
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
