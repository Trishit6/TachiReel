import { type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Line as SvgLine, Path, Text as SvgText } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { Badge, ClayButton, ClayCard, ClayInput, Dialog, EmptyState, LoadingState, Notice, PageHeader, ScreenScroll, type IconName } from '../ui';
import { formatNumber, titleCase, toneForStatus, type SeriesPoint } from '../../lib/admin';
import { brand } from '../../theme/brand';
import { useTheme } from '../../theme/theme';

export function AdminPage({
  eyebrow = 'TachiReel Admin',
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ScreenScroll maxWidth={1440} contentContainerStyle={{ paddingTop: 24, paddingBottom: 64, gap: 20 }}>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />
      {children}
    </ScreenScroll>
  );
}

export function AdminCard({ children, style }: { children: ReactNode; style?: any }) {
  return (
    <ClayCard style={[{ padding: 18, gap: 14 }, style]} elevated="soft">
      {children}
    </ClayCard>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: IconName;
  accent?: boolean;
}) {
  const { colors, radii, type } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 180,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: accent ? brand.reelRed : colors.line,
        backgroundColor: colors.surface,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: accent ? '#F6E1DB' : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={15} color={accent ? brand.reelRed : colors.accent} />
        </View>
      </View>
      <Text style={[type.displaySm, { color: colors.ink }]}>{typeof value === 'number' ? formatNumber(value) : value}</Text>
      {hint ? <Text style={[type.tiny, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge label={titleCase(status)} tone={toneForStatus(status ?? '')} />;
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 7 }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      <View style={{ flexShrink: 1, maxWidth: '65%', alignItems: 'flex-end' }}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text style={[type.smallMedium, { color: colors.ink, textAlign: 'right' }]}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export type AdminColumn<T> = {
  key: string;
  label: string;
  width?: number;
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Try changing the filters or check back later.',
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { colors, radii, type } = useTheme();
  const minWidth = columns.reduce((sum, column) => sum + (column.width ?? 150), 0);

  if (!rows.length) return <EmptyState icon="inbox" title={emptyTitle} description={emptyDescription} />;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth }}>
      <View>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 9 }}>
          {columns.map((column) => (
            <View key={column.key} style={{ width: column.width ?? 150, paddingRight: 10 }}>
              <Text style={[type.tiny, { color: colors.muted }]}>{column.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
        {rows.map((row) => {
          const content = (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 56,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                paddingVertical: 9,
                borderRadius: radii.control,
              }}
            >
              {columns.map((column) => (
                <View key={column.key} style={{ width: column.width ?? 150, paddingRight: 10, flexShrink: 1 }}>
                  {column.render(row)}
                </View>
              ))}
            </View>
          );
          return onRowPress ? (
            <Pressable key={rowKey(row)} onPress={() => onRowPress(row)} accessibilityRole="button" accessibilityLabel="Open details">
              {content}
            </Pressable>
          ) : (
            <View key={rowKey(row)}>{content}</View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { colors, type, radii } = useTheme();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <Text style={[type.small, { color: colors.muted }]}>
        {total ? `${formatNumber((page - 1) * pageSize + 1)}–${formatNumber(Math.min(page * pageSize, total))} of ${formatNumber(total)}` : 'No results'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ClayButton label="Previous" variant="outline" size="sm" icon="chevron-left" disabled={page <= 1} onPress={() => onPageChange(page - 1)} />
        <View style={{ minWidth: 54, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.accentSoft }}>
          <Text style={[type.smallMedium, { color: colors.accent }]}>{page} / {pages}</Text>
        </View>
        <ClayButton label="Next" variant="outline" size="sm" iconRight="chevron-right" disabled={page >= pages} onPress={() => onPageChange(page + 1)} />
      </View>
    </View>
  );
}

export function FilterRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>{children}</View>;
}

export function LineChart({
  data,
  title,
  height = 190,
}: {
  data: SeriesPoint[];
  title: string;
  height?: number;
}) {
  const { colors, type } = useTheme();
  const points = data.filter((point) => Number.isFinite(point.value));
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 640;
  const padding = { left: 34, right: 14, top: 12, bottom: 28 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coords = points.map((point, index) => {
    const x = padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (point.value / max) * innerHeight;
    return { x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');

  return (
    <AdminCard>
      <Text style={[type.h3, { color: colors.ink }]}>{title}</Text>
      {points.length === 0 ? (
        <EmptyState icon="bar-chart" title="No data in this range" description="Choose a wider date range to see activity." />
      ) : (
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={`${title} chart`}>
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerHeight * ratio;
            return <SvgLine key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={colors.line} strokeWidth={1} />;
          })}
          <Path d={path} fill="none" stroke={brand.reelRed} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((point, index) => (
            <SvgLine key={index} x1={point.x} x2={point.x} y1={point.y - 3} y2={point.y + 3} stroke={brand.reelRed} strokeWidth={2} />
          ))}
          <SvgText x={2} y={padding.top + 4} fill={colors.muted} fontSize={10}>{formatNumber(max)}</SvgText>
          <SvgText x={2} y={padding.top + innerHeight + 4} fill={colors.muted} fontSize={10}>0</SvgText>
          <SvgText x={padding.left} y={height - 7} fill={colors.muted} fontSize={10}>{points[0]?.date.slice(5)}</SvgText>
          <SvgText x={width - padding.right} y={height - 7} textAnchor="end" fill={colors.muted} fontSize={10}>
            {points[points.length - 1]?.date.slice(5)}
          </SvgText>
        </Svg>
      )}
    </AdminCard>
  );
}

export function ReasonDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  loading = false,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  requireReason = true,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  requireReason?: boolean;
}) {
  const invalid = requireReason && reason.trim().length < 3;
  return (
    <Dialog
      visible={visible}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      destructive={destructive}
      loading={loading}
      onConfirm={invalid ? undefined : onConfirm}
      onCancel={onCancel}
    >
      <ClayInput
        label={requireReason ? 'Reason (saved to the audit log)' : 'Note (optional)'}
        value={reason}
        onChangeText={onReasonChange}
        multiline
        placeholder="Explain why this action is needed"
        maxLength={500}
      />
      {invalid ? <Notice text="Enter at least 3 characters." tone="error" /> : null}
    </Dialog>
  );
}

export function AdminRestricted({ permission }: { permission: string }) {
  return (
    <AdminPage title="Access restricted">
      <AdminCard>
        <EmptyState
          icon="lock"
          tone="peach"
          title="Not available for your role"
          description={`This area requires the ${permission} permission. Ask a Super Admin to update your role if you need it.`}
        />
      </AdminCard>
    </AdminPage>
  );
}

export function LoadingCard({ label = 'Loading records' }: { label?: string }) {
  return (
    <AdminCard>
      <LoadingState label={label} />
    </AdminCard>
  );
}
