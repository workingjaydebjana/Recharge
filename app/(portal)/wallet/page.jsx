'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import WalletAndCommissionView from '@/components/user/WalletAndCommissionView.jsx';

export default function WalletPage() {
  const { token, meData, openAddBalance, refreshMe } = usePortal();

  return (
    <WalletAndCommissionView
      token={token}
      mode="WALLET"
      initialWallet={meData.wallet}
      initialCommissions={meData.commissions}
      onOpenAddBalance={openAddBalance}
      onSuccessRefresh={refreshMe}
    />
  );
}
