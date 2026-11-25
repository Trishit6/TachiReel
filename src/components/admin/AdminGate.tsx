import { type ReactNode, useEffect } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ClayButton, EmptyState, LoadingState } from '../ui';
import { SemanticHeading } from '../SemanticHeading';
import { TachiReelLogo } from '../Brand';
import { useAdmin } from './AdminProvider';
import { useSession } from '../../lib/session';
import { useTheme } from '../../theme/theme';

export function AdminGate({ children }: { children: ReactNode }) {
  const { loading, access, error } = useAdmin();
  const { signOut, isDemo, userId, profile, loading: sessionLoading } = useSession();
  const { colors, type } = useTheme();
  const unauthenticated = !sessionLoading && !userId && !isDemo;
  // Server RPCs already deny staff access for suspended accounts; reflect the
  // same rule in the gate so the shell never opens for one.
  const accountInactive = Boolean(userId && profile && profile.account_status !== 'active');

  useEffect(() => {
    if (!loading && !access && unauthenticated) router.replace('/admin/login');
  }, [access, loading, unauthenticated]);

  if (unauthenticated && !access) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background }}>
        <SemanticHeading visuallyHidden>Administrator sign in</SemanticHeading>
        <TachiReelLogo size={44} />
        <LoadingState label="Opening administrator sign in" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background }}>
        <SemanticHeading visuallyHidden>Admin workspace</SemanticHeading>
        <TachiReelLogo size={44} />
        <LoadingState label="Verifying administrator access" />
      </View>
    );
  }

  if (!access || accountInactive) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SemanticHeading visuallyHidden>Admin workspace</SemanticHeading>
        <EmptyState
          icon={isDemo ? 'eye-off' : 'shield'}
          tone="peach"
          title="Admin workspace unavailable"
          description={
            error ??
            (accountInactive
              ? 'This account is not active. Contact a Super Admin if you believe this is a mistake.'
              : isDemo
                ? 'Preview mode does not grant administrator privileges. Connect Supabase and sign in with an assigned staff account.'
                : 'This account does not have an active administrator role.')
          }
          action={
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <ClayButton label="Back to app" variant="secondary" size="sm" icon="arrow-left" onPress={() => router.replace('/(tabs)/home')} />
              <ClayButton label="Sign out" variant="outline" size="sm" onPress={() => void signOut()} />
            </View>
          }
        />
        <Text style={[type.tiny, { color: colors.muted, marginTop: 16, textAlign: 'center' }]}>
          Roles are assigned in Postgres and checked on every server request. There is no public admin sign-up.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
