'use client';

import { usePortal } from '@/components/PortalShell.jsx';
import ProfileAndSupportView from '@/components/user/ProfileAndSupportView.jsx';

export default function ProfilePage() {
  const { token, meData, updateUser, signOut } = usePortal();

  return (
    <ProfileAndSupportView
      token={token}
      user={meData.user}
      mode="PROFILE"
      onUserUpdated={updateUser}
      onLogout={signOut}
    />
  );
}
