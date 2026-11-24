'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePortal } from '@/components/PortalShell.jsx';
import ProfileAndSupportView from '@/components/user/ProfileAndSupportView.jsx';

function ComplaintsContent() {
  const searchParams = useSearchParams();
  const { token, meData, updateUser, signOut } = usePortal();
  const ref = searchParams.get('ref');
  const type = searchParams.get('type');
  const op = searchParams.get('op');

  const prefillComplaintTx = ref
    ? { _id: ref, type: type || 'MOBILE_RECHARGE', operatorName: op || '' }
    : null;

  return (
    <ProfileAndSupportView
      token={token}
      user={meData.user}
      mode="COMPLAINTS"
      prefillComplaintTx={prefillComplaintTx}
      onUserUpdated={updateUser}
      onLogout={signOut}
    />
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense fallback={null}>
      <ComplaintsContent />
    </Suspense>
  );
}
