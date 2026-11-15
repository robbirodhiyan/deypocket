import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from 'react-native-svg';

import {
  formatMonthLabel,
  type MonthlyTrend,
} from './budget-repository';
import { formatRupiah } from './format';

// Semua seri menggunakan skala Y yang sama agar bisa dibandingkan.
const CHART_HEIGHT = 214;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 194;
const PLOT_LEFT = 51;
const PLOT_RIGHT = 12;

type TrendField = 'income' | 'expense';

type Props = {
  data: MonthlyTrend[];
};

function shortMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
  }).format(new Date(year, number - 1, 1));
}

function compactCurrency(value: number): string {
  if (value === 0) return '0';

  const number = (scaled: number) =>
    scaled.toLocaleString('id-ID', {
      maximumFractionDigits: 1,
    });

  if (value >= 1_000_000_000) {
    return `${number(value / 1_000_000_000)} M`;
  }
  if (value >= 1_000_000) {
    return `${number(value / 1_000_000)} jt`;
  }
  if (value >= 1_000) {
    return `${number(value / 1_000)} rb`;
  }
  return number(value);
}

function axisMaximum(data: MonthlyTrend[]): number {
  const maximum = Math.max(
    0,
    ...data.map((row) => Math.max(row.income, row.expense))
  );

  if (maximum === 0) return 1_000;

  const magnitude = Math.pow(10, Math.floor(Math.log10(maximum)));
  return Math.max(4, Math.ceil(maximum / magnitude) * magnitude);
}

function xPosition(
  index: number,
  count: number,
  width: number
): number {
  const available = Math.max(1, width - PLOT_LEFT - PLOT_RIGHT);
  if (count <= 1) return PLOT_LEFT + available / 2;
  return PLOT_LEFT + (index / (count - 1)) * available;
}

function yPosition(value: number, maximum: number): number {
  const ratio = Math.min(Math.max(value / maximum, 0), 1);
  return PLOT_BOTTOM - ratio * (PLOT_BOTTOM - PLOT_TOP);
}

function linePath(
  data: MonthlyTrend[],
  key: TrendField,
  width: number,
  maximum: number
): string {
  return data
    .map((row, index) => {
      const x = xPosition(index, data.length, width);
      const y = yPosition(row[key], maximum);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export default function FinanceTrendChart({ data }: Props) {
  const theme = useTheme();
  const [chartWidth, setChartWidth] = useState(320);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMonth(data[data.length - 1]?.month ?? null);
  }, [data]);

  const maxValue = useMemo(() => axisMaximum(data), [data]);

  const selected =
    data.find((row) => row.month === selectedMonth) ??
    data[data.length - 1];

  const selectedIndex = selected
    ? data.findIndex((row) => row.month === selected.month)
    : -1;

  const incomeColor = theme.colors.primary;
  const expenseColor = theme.colors.error;

  const hasValues = data.some(
    (row) => row.income > 0 || row.expense > 0
  );

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: incomeColor }]}
          />
          <Text variant="labelMedium">Pemasukan</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: expenseColor }]}
          />
          <Text variant="labelMedium">Pengeluaran</Text>
        </View>
      </View>

      <View
        style={{ width: '100%' }}
        onLayout={(event) => {
          const nextWidth = Math.max(
            200,
            Math.round(event.nativeEvent.layout.width)
          );
          setChartWidth((previous) =>
            Math.abs(previous - nextWidth) > 1 ? nextWidth : previous
          );
        }}
      >
        <Svg
          width={chartWidth}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = yPosition(maxValue * fraction, maxValue);

            return (
              <Line
                key={`grid-${fraction}`}
                x1={PLOT_LEFT}
                x2={chartWidth - PLOT_RIGHT}
                y1={y}
                y2={y}
                stroke={theme.colors.outlineVariant}
                strokeWidth={1}
                strokeDasharray={fraction === 0 ? undefined : '3 5'}
              />
            );
          })}

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = yPosition(maxValue * fraction, maxValue);
            return (
              <SvgText
                key={`axis-${fraction}`}
                x={PLOT_LEFT - 7}
                y={y + 3.5}
                textAnchor="end"
                fontSize={10}
                fill={theme.colors.onSurfaceVariant}
              >
                {compactCurrency(maxValue * fraction)}
              </SvgText>
            );
          })}

          {selectedIndex >= 0 && (
            <Line
              x1={xPosition(selectedIndex, data.length, chartWidth)}
              x2={xPosition(selectedIndex, data.length, chartWidth)}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              stroke={theme.colors.outlineVariant}
              strokeWidth={1.5}
              strokeDasharray="4 5"
            />
          )}

          {hasValues && (
            <>
              <Path
                d={linePath(data, 'income', chartWidth, maxValue)}
                stroke={incomeColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d={linePath(data, 'expense', chartWidth, maxValue)}
                stroke={expenseColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {data.map((row, index) => {
                const x = xPosition(index, data.length, chartWidth);
                const highlighted = index === selectedIndex;
                return (
                  <Circle
                    key={`income-${row.month}`}
                    cx={x}
                    cy={yPosition(row.income, maxValue)}
                    r={highlighted ? 5 : 3}
                    fill={theme.colors.surface}
                    stroke={incomeColor}
                    strokeWidth={highlighted ? 3 : 2}
                  />
                );
              })}

              {data.map((row, index) => {
                const x = xPosition(index, data.length, chartWidth);
                const highlighted = index === selectedIndex;
                return (
                  <Circle
                    key={`expense-${row.month}`}
                    cx={x}
                    cy={yPosition(row.expense, maxValue)}
                    r={highlighted ? 5 : 3}
                    fill={theme.colors.surface}
                    stroke={expenseColor}
                    strokeWidth={highlighted ? 3 : 2}
                  />
                );
              })}
            </>
          )}
        </Svg>
      </View>

      <View style={styles.months}>
        {data.map((row) => {
          const active = selected?.month === row.month;
          return (
            <Pressable
              key={row.month}
              accessibilityRole="button"
              accessibilityLabel={`Pilih bulan ${formatMonthLabel(row.month)}`}
              onPress={() => setSelectedMonth(row.month)}
              style={[
                styles.month,
                {
                  backgroundColor: active
                    ? theme.colors.primaryContainer
                    : 'transparent',
                },
              ]}
            >
              <Text
                variant="labelSmall"
                numberOfLines={1}
                style={{
                  color: active
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.onSurfaceVariant,
                  fontWeight: active ? '700' : '400',
                }}
              >
                {shortMonth(row.month)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected && (
        <View
          style={[
            styles.detail,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <Text variant="titleSmall" style={styles.detailTitle}>
            {formatMonthLabel(selected.month)}
          </Text>

          <View style={styles.detailAmounts}>
            <View style={styles.amountColumn}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Pemasukan
              </Text>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: incomeColor, fontWeight: '700' }}
              >
                {formatRupiah(selected.income)}
              </Text>
            </View>

            <View style={styles.amountColumn}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Pengeluaran
              </Text>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: expenseColor, fontWeight: '700' }}
              >
                {formatRupiah(selected.expense)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {!hasValues && (
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.onSurfaceVariant,
            textAlign: 'center',
          }}
        >
          Belum ada pemasukan atau pengeluaran dalam periode ini.
        </Text>
      )}

      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}
      >
        Dua garis menggunakan skala rupiah yang sama. Pilih bulan
        untuk melihat rincian nilainya.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 22,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  months: {
    flexDirection: 'row',
    gap: 2,
    marginTop: -8,
  },
  month: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  detail: {
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  detailTitle: {
    fontWeight: '700',
  },
  detailAmounts: {
    flexDirection: 'row',
    gap: 12,
  },
  amountColumn: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
});
