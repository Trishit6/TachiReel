import { Slot } from 'expo-router';
import { AdminGate } from '../../components/admin/AdminGate';
import { AdminProvider } from '../../components/admin/AdminProvider';
import { AdminShell } from '../../components/admin/AdminShell';

export default function AdminLayout() {
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
