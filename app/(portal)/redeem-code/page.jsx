'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import RedeemCodeView from '@/components/user/RedeemCodeView.jsx';

export default function RedeemCodePage() {
  const { token, meData, refreshMe } = usePortal();

  return (
    <RedeemCodeView
      token={token}
      wallet={meData.wallet}
      settings={meData.settings}
      commissions={meData.commissions}
      onSuccessRefresh={refreshMe}
    />
  );
}
