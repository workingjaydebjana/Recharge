'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import WalletAndCommissionView from '@/components/user/WalletAndCommissionView.jsx';

export default function CommissionPage() {
  const { token, meData, refreshMe } = usePortal();

  return (
    <WalletAndCommissionView
      token={token}
      mode="COMMISSION"
      initialWallet={meData.wallet}
      initialCommissions={meData.commissions}
      onSuccessRefresh={refreshMe}
    />
  );
}
