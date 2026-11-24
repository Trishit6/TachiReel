import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { adminApi, friendlyError, hasPermission, type AdminAccess, type AdminPermission } from '../../lib/admin';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

type AdminContextValue = {
  loading: boolean;
  access: AdminAccess | null;
  error: string | null;
  can: (permission: AdminPermission) => boolean;
  refresh: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: PropsWithChildren) {
  const { loading: sessionLoading, userId } = useSession();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setAccess(null);
      setError('Administrator access needs a connected Supabase project. Preview mode never grants staff privileges.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await adminApi.access();
      const current = Array.isArray(rows) ? rows[0] : (rows as unknown as AdminAccess | undefined);
      setAccess(current ?? null);
      if (!current) setError('This account does not have an active administrator role.');
    } catch (caught) {
      setAccess(null);
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    const timer = setTimeout(() => {
      if (!userId) {
        setAccess(null);
        setError('Sign in with an administrator account to open this workspace.');
        setLoading(false);
        return;
      }
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh, sessionLoading, userId]);

  const value = useMemo<AdminContextValue>(
    () => ({ loading, access, error, can: (permission) => hasPermission(access, permission), refresh }),
    [loading, access, error, refresh],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used inside AdminProvider');
  return context;
}
