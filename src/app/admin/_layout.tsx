import { Slot, usePathname } from 'expo-router';
import { AdminGate } from '../../components/admin/AdminGate';
import { AdminProvider } from '../../components/admin/AdminProvider';
import { AdminShell } from '../../components/admin/AdminShell';

export default function AdminLayout() {
  const pathname = usePathname();

  // The dedicated login screen must stay reachable before a staff session
  // exists, so it renders outside the provider/gate/shell.
  if (pathname === '/admin/login') return <Slot />;

  return (
    <AdminProvider>
      <AdminGate>
        <AdminShell>
          <Slot />
        </AdminShell>
      </AdminGate>
    </AdminProvider>
  );
}
