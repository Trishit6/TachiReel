import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SemanticHeading } from '../../components/SemanticHeading';
import { Chip, ClayButton, ClayInput, ScreenScroll } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminRestricted, LineChart, LoadingCard, StatCard } from '../../components/admin/AdminUI';
import {
  RANGE_PRESETS,
  adminApi,
  formatDate,
  formatNumber,
  friendlyError,
  rangeForPreset,
  type AnalyticsData,
  type RangePreset,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

export default function AdminAnalyticsScreen() {
  const { can } = useAdmin();
  const { colors, type } = useTheme();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (preset === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
        throw new Error('Enter both custom dates as YYYY-MM-DD.');
      }
      const range = rangeForPreset(preset, from, to);
      setData(await adminApi.analytics(range.from, range.to));
    } catch (caught) {
      setError(friendlyError(caught));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, preset, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!can('analytics.view')) return <AdminRestricted permission="analytics.view" />;

  const sum = (points: { value: number }[] | undefined) => (points ?? []).reduce((total, point) => total + point.value, 0);
  const peak = (points: { value: number }[] | undefined) => (points ?? []).reduce((best, point) => Math.max(best, point.value), 0);

  return (
    <ScreenScroll maxWidth={1440} contentContainerStyle={{ paddingTop: 24, paddingBottom: 64, gap: 20 }}>
      <View style={{ gap: 6 }}>
        <Text style={[type.overline, { color: colors.muted }]}>TachiReel Admin</Text>
        <SemanticHeading style={[type.h1, { color: colors.ink }]}>Platform Analytics</SemanticHeading>
        <Text style={[type.bodySmall, { color: colors.inkSoft }]}>
          Traffic, content and safety trends calculated from live database rows.{' '}
          {data ? `Showing ${formatDate(data.range.from)} to ${formatDate(data.range.to)}.` : ''}
        </Text>
      </View>

      <AdminCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />
          {RANGE_PRESETS.map((option) => (
            <Chip key={option.value} label={option.label} active={preset === option.value} onPress={() => setPreset(option.value)} />
          ))}
        </View>
        {preset === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ width: 200 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
            <View style={{ width: 200 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
          </View>
        ) : null}
      </AdminCard>

      {loading ? <LoadingCard label="Calculating analytics" /> : null}
      {!loading && error ? (
        <AdminCard>
          <Text style={[type.body, { color: colors.danger }]}>{error}</Text>
        </AdminCard>
      ) : null}

      {data && !loading ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatCard label="New users" value={sum(data.registrations)} hint="In selected range" icon="user-plus" accent />
            <StatCard label="Daily active peak" value={peak(data.daily_active_users)} hint="Unique active users" icon="activity" />
            <StatCard label="Monthly active peak" value={peak(data.monthly_active_users)} hint="Unique active users" icon="users" />
            <StatCard label="Posts published" value={sum(data.posts)} hint="Photo posts" icon="image" />
            <StatCard label="Reelyx published" value={sum(data.reelyx)} hint="Videos" icon="video" />
            <StatCard label="Engagement actions" value={sum(data.engagement)} hint="Likes and comments" icon="heart" />
            <StatCard label="Reports" value={sum(data.reports)} hint="Submitted by users" icon="flag" />
            <StatCard label="Tickets" value={sum(data.tickets)} hint="Opened by users" icon="life-buoy" />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Registrations" data={data.registrations} height={210} /></View>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Daily active users" data={data.daily_active_users} height={210} /></View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Posts published" data={data.posts} height={210} /></View>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Reelyx videos published" data={data.reelyx} height={210} /></View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Engagement (likes + comments)" data={data.engagement} height={210} /></View>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Reports submitted" data={data.reports} height={210} /></View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Support tickets opened" data={data.tickets} height={210} /></View>
            <View style={{ flex: 1, minWidth: 320 }}><LineChart title="Monthly active users" data={data.monthly_active_users} height={210} /></View>
          </View>

          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Range totals</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { label: 'Monthly registrations', value: sum(data.monthly_registrations) },
                { label: 'Daily active peak', value: peak(data.daily_active_users) },
                { label: 'Reports', value: sum(data.reports) },
                { label: 'Tickets', value: sum(data.tickets) },
              ].map((item) => (
                <View key={item.label} style={{ minWidth: 150, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
                  <Text style={[type.tiny, { color: colors.muted }]}>{item.label}</Text>
                  <Text style={[type.h3, { color: colors.ink }]}>{formatNumber(item.value)}</Text>
                </View>
              ))}
            </View>
          </AdminCard>
        </>
      ) : null}
    </ScreenScroll>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Platform Analytics", "/admin/analytics");
}
