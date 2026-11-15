
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';

import {
    ActivityIndicator,
    Button,
    Card,
    IconButton,
    ProgressBar,
    Text,
    useTheme,
} from 'react-native-paper';

import {
    formatMonthLabel,
    getBudgetOverview,
    getCurrentMonth,
    getSixMonthTrend,
    moveMonth,
    type BudgetOverview,
    type MonthlyTrend,
} from '../../features/deypocket/budget-repository';

import { formatRupiah } from '../../features/deypocket/format';
import FinanceTrendChart from '../../features/deypocket/finance-trend-chart';

// =====================================================
// HELPERS
// =====================================================

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}

function formatSignedRupiah(value: number): string {
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';

  return `${sign}${formatRupiah(Math.abs(value))}`;
}

function formatCompactRupiah(value: number): string {
  const abs = Math.abs(value);

  const format = (number: number) =>
    number.toLocaleString('id-ID', {
      maximumFractionDigits: 1,
    });

  if (abs >= 1_000_000_000) {
    return `Rp${format(value / 1_000_000_000)} M`;
  }

  if (abs >= 1_000_000) {
    return `Rp${format(value / 1_000_000)} jt`;
  }

  if (abs >= 1_000) {
    return `Rp${format(value / 1_000)} rb`;
  }

  return formatRupiah(value);
}

function categoryIcon(name: string) {
  const lower = name.toLowerCase();

  if (lower.includes('makan') || lower.includes('minum')) {
    return 'silverware-fork-knife' as const;
  }

  if (lower.includes('transport')) {
    return 'car-outline' as const;
  }

  if (lower.includes('belanja')) {
    return 'cart-outline' as const;
  }

  if (lower.includes('tagihan')) {
    return 'receipt-text-outline' as const;
  }

  if (lower.includes('hiburan')) {
    return 'movie-outline' as const;
  }

  if (lower.includes('kesehatan')) {
    return 'medical-bag' as const;
  }

  if (lower.includes('pendidikan')) {
    return 'school-outline' as const;
  }

  return 'shape-outline' as const;
}

// =====================================================
// COMPONENT: METRIC CARD
// =====================================================

type MetricCardProps = {
  label: string;
  amount: number;
  kind: 'income' | 'expense';
  compact: boolean;
};

function MetricCard({
  label,
  amount,
  kind,
  compact,
}: MetricCardProps) {
  const theme = useTheme();

  const isIncome = kind === 'income';

  const accent = isIncome
    ? theme.colors.primary
    : theme.colors.error;

  const iconBackground = isIncome
    ? theme.colors.primaryContainer
    : theme.colors.errorContainer;

  return (
    <Card
      mode="outlined"
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
      }}
    >
      <Card.Content
        style={{
          padding: compact ? 14 : 18,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            backgroundColor: iconBackground,
          }}
        >
          <MaterialCommunityIcons
            name={isIncome ? 'arrow-down-left' : 'arrow-up-right'}
            size={23}
            color={accent}
          />
        </View>

        <View style={{ gap: 5 }}>
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {label}
          </Text>

          <Text
            style={{
              fontSize: compact ? 17 : 21,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: theme.colors.onSurface,
              flexShrink: 1,
            }}
          >
            {formatRupiah(amount)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

// =====================================================
// MAIN SCREEN
// =====================================================

export default function InsightsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const { width } = useWindowDimensions();
  const compact = width < 430;

  // ===================================================
  // STATE
  // ===================================================

  const [month, setMonth] = useState(getCurrentMonth);

  const [overview, setOverview] =
    useState<BudgetOverview | null>(null);

  const [trend, setTrend] = useState<MonthlyTrend[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reloadKey, setReloadKey] = useState(0);

  // ===================================================
  // DATABASE
  // ===================================================

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setError('');

        try {
          const [monthly, history] = await Promise.all([
            getBudgetOverview(db, month),
            getSixMonthTrend(db, month),
          ]);

          if (!active) return;

          setOverview(monthly);
          setTrend(history);
        } catch (err) {
          if (!active) return;

          setOverview(null);
          setTrend([]);

          setError(
            err instanceof Error
              ? err.message
              : 'Gagal memuat data Insight.'
          );
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [db, month, reloadKey])
  );

  // ===================================================
  // CALCULATIONS
  // ===================================================

  const income = overview?.income ?? 0;
  const expense = overview?.expense ?? 0;

  const net = income - expense;

  const expenseCategories =
    overview?.categories.filter(
      (category) => category.spent_rupiah > 0
    ) ?? [];

  const topCategories = expenseCategories.slice(0, 5);

  const otherCategories = expenseCategories.slice(5);

  const otherExpense = otherCategories.reduce(
    (total, category) => total + category.spent_rupiah,
    0
  );

  const previousMonth = moveMonth(month, -1);

  const previousExpense =
    trend.find((item) => item.month === previousMonth)
      ?.expense ?? 0;

  const difference = expense - previousExpense;

  const differencePercent =
    previousExpense > 0
      ? Math.round(
          (Math.abs(difference) / previousExpense) * 100
        )
      : null;

  const categoryAccents = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.tertiary,
    theme.colors.error,
    theme.colors.onSurfaceVariant,
  ];

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {/* =================================================
          HEADER
      ================================================= */}

      <View style={styles.header}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            variant="labelLarge"
            style={{
              color: theme.colors.primary,
              fontWeight: '700',
            }}
          >
            DEYPOCKET
          </Text>

          <Text
            variant="headlineMedium"
            style={{
              fontWeight: '800',
              letterSpacing: -0.7,
            }}
          >
            Insight Keuangan
          </Text>

          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onSurfaceVariant,
              lineHeight: 21,
            }}
          >
            Kenali pola pemasukan dan pengeluaranmu.
          </Text>
        </View>

        <IconButton
          icon="refresh"
          size={22}
          disabled={loading}
          iconColor={theme.colors.onSurfaceVariant}
          style={{
            backgroundColor: theme.colors.surfaceVariant,
            margin: 0,
          }}
          onPress={() => setReloadKey((value) => value + 1)}
        />
      </View>

      {/* =================================================
          MONTH SELECTOR
      ================================================= */}

      <View
        style={[
          styles.monthSelector,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <IconButton
          icon="chevron-left"
          size={23}
          disabled={loading}
          onPress={() =>
            setMonth((value) => moveMonth(value, -1))
          }
        />

        <View style={{ alignItems: 'center', gap: 3 }}>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            PERIODE LAPORAN
          </Text>

          <Text
            variant="titleMedium"
            style={{ fontWeight: '700' }}
          >
            {formatMonthLabel(month)}
          </Text>
        </View>

        <IconButton
          icon="chevron-right"
          size={23}
          disabled={loading}
          onPress={() =>
            setMonth((value) => moveMonth(value, 1))
          }
        />
      </View>

      {/* =================================================
          LOADING / ERROR
      ================================================= */}

      {loading && (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" />

          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Memuat laporan keuangan...
          </Text>
        </View>
      )}

      {!loading && !!error && (
        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.emptyState}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={42}
              color={theme.colors.error}
            />

            <Text variant="titleMedium">
              Gagal Memuat Insight
            </Text>

            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: 'center',
              }}
            >
              {error}
            </Text>

            <Button
              mode="contained"
              onPress={() =>
                setReloadKey((value) => value + 1)
              }
            >
              Coba Lagi
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      {!loading && overview && (
        <>
          {/* =============================================
              NET CASH FLOW
          ============================================= */}

          <Card
            mode="contained"
            style={{
              borderRadius: 24,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Card.Content
              style={{
                paddingHorizontal: 22,
                paddingVertical: 24,
                gap: 18,
              }}
            >
              <View style={styles.spaceBetween}>
                <Text
                  variant="titleMedium"
                  style={{
                    color: theme.colors.onPrimary,
                    fontWeight: '600',
                  }}
                >
                  Arus Kas Bersih
                </Text>

                <MaterialCommunityIcons
                  name={net < 0 ? 'trending-down' : 'trending-up'}
                  size={25}
                  color={theme.colors.onPrimary}
                />
              </View>

              <View style={{ gap: 7 }}>
                <Text
                  style={{
                    color: theme.colors.onPrimary,
                    fontSize: compact ? 27 : 35,
                    fontWeight: '800',
                    letterSpacing: -1,
                  }}
                >
                  {formatSignedRupiah(net)}
                </Text>

                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onPrimary,
                    opacity: 0.85,
                  }}
                >
                  {net > 0
                    ? 'Pemasukan lebih besar dari pengeluaran.'
                    : net < 0
                      ? 'Pengeluaran lebih besar dari pemasukan.'
                      : 'Pemasukan dan pengeluaran seimbang.'}
                </Text>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: theme.colors.onPrimary,
                  opacity: 0.2,
                }}
              />

              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onPrimary,
                  opacity: 0.8,
                }}
              >
                Selisih arus kas periode ini, tidak termasuk
                transfer antar-dompet.
              </Text>
            </Card.Content>
          </Card>

          {/* =============================================
              INCOME & EXPENSE CARDS
          ============================================= */}

          <View style={styles.metricRow}>
            <MetricCard
              label="Total Pemasukan"
              amount={income}
              kind="income"
              compact={compact}
            />

            <MetricCard
              label="Total Pengeluaran"
              amount={expense}
              kind="expense"
              compact={compact}
            />
          </View>

          {/* =============================================
              CATEGORY EXPENSES
          ============================================= */}

          <View style={styles.sectionHeading}>
            <View style={{ gap: 5 }}>
              <Text
                variant="titleLarge"
                style={styles.sectionTitle}
              >
                Pengeluaran Terbesar
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                Kategori pengeluaran bulan ini
              </Text>
            </View>
          </View>

          <Card
            mode="outlined"
            style={[
              styles.card,
              { borderColor: theme.colors.outlineVariant },
            ]}
          >
            <Card.Content style={{ gap: 20 }}>
              {expenseCategories.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="chart-donut"
                    size={45}
                    color={theme.colors.onSurfaceVariant}
                  />

                  <Text variant="titleMedium">
                    Belum ada pengeluaran
                  </Text>

                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      textAlign: 'center',
                    }}
                  >
                    Pengeluaran yang kamu catat akan
                    ditampilkan berdasarkan kategorinya.
                  </Text>
                </View>
              ) : (
                <>
                  {topCategories.map((category, index) => {
                    const percentage =
                      expense > 0
                        ? (category.spent_rupiah / expense) * 100
                        : 0;

                    const accent =
                      categoryAccents[
                        index % categoryAccents.length
                      ];

                    return (
                      <View
                        key={category.category_id}
                        style={{ gap: 12 }}
                      >
                        <View style={styles.categoryRow}>
                          <View
                            style={[
                              styles.categoryIcon,
                              {
                                backgroundColor:
                                  theme.colors.surfaceVariant,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={categoryIcon(category.name)}
                              size={22}
                              color={accent}
                            />
                          </View>

                          <View style={{ flex: 1, gap: 6 }}>
                            <View style={styles.spaceBetween}>
                              <Text
                                variant="titleSmall"
                                numberOfLines={1}
                                style={{
                                  flex: 1,
                                  fontWeight: '700',
                                }}
                              >
                                {category.name}
                              </Text>

                              <Text
                                variant="titleSmall"
                                style={{
                                  fontWeight: '700',
                                }}
                              >
                                {formatRupiah(
                                  category.spent_rupiah
                                )}
                              </Text>
                            </View>

                            <ProgressBar
                              progress={clamp(percentage / 100)}
                              color={accent}
                              style={{
                                height: 8,
                                borderRadius: 8,
                              }}
                            />

                            <View style={styles.spaceBetween}>
                              <Text
                                variant="labelSmall"
                                style={{
                                  color:
                                    theme.colors.onSurfaceVariant,
                                }}
                              >
                                {percentage.toFixed(1)}% dari total
                              </Text>

                              {category.limit_rupiah !== null && (
                                <Text
                                  variant="labelSmall"
                                  style={{
                                    color:
                                      theme.colors.onSurfaceVariant,
                                  }}
                                >
                                  Budget{' '}
                                  {formatCompactRupiah(
                                    category.limit_rupiah
                                  )}
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {otherCategories.length > 0 && (
                    <View
                      style={{
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor:
                          theme.colors.outlineVariant,
                        paddingTop: 16,
                      }}
                    >
                      <View style={styles.spaceBetween}>
                        <Text
                          variant="bodyMedium"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                          }}
                        >
                          {otherCategories.length} kategori lainnya
                        </Text>

                        <Text
                          variant="titleSmall"
                          style={{ fontWeight: '700' }}
                        >
                          {formatRupiah(otherExpense)}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View
                    style={[
                      styles.totalFooter,
                      {
                        backgroundColor:
                          theme.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <Text
                      variant="labelLarge"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      Total Pengeluaran
                    </Text>

                    <Text
                      variant="titleMedium"
                      style={{
                        fontWeight: '800',
                        color: theme.colors.onSurface,
                      }}
                    >
                      {formatRupiah(expense)}
                    </Text>
                  </View>
                </>
              )}
            </Card.Content>
          </Card>

          {/* =============================================
              SIX-MONTH TREND — ONE COMBINED LINE CHART
          ============================================= */}

          <View style={styles.sectionHeading}>
            <View style={{ gap: 5 }}>
              <Text
                variant="titleLarge"
                style={styles.sectionTitle}
              >
                Tren Keuangan
              </Text>

              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Pemasukan dan pengeluaran selama enam bulan
              </Text>
            </View>
          </View>

          <Card
            mode="outlined"
            style={[
              styles.card,
              { borderColor: theme.colors.outlineVariant },
            ]}
          >
            <Card.Content style={{ gap: 20 }}>
              <FinanceTrendChart data={trend} />
            </Card.Content>
          </Card>

          {/* =============================================
              MONTHLY COMPARISON
          ============================================= */}

          <View style={styles.sectionHeading}>
            <View style={{ gap: 5 }}>
              <Text
                variant="titleLarge"
                style={styles.sectionTitle}
              >
                Perbandingan Bulanan
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                Dibandingkan dengan bulan sebelumnya
              </Text>
            </View>
          </View>

          <Card
            mode="contained"
            style={{
              borderRadius: 20,
              backgroundColor: theme.colors.surfaceVariant,
            }}
          >
            <Card.Content style={{ gap: 16 }}>
              <View style={styles.spaceBetween}>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: '700' }}
                >
                  Perubahan Pengeluaran
                </Text>

                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <MaterialCommunityIcons
                    name={
                      difference > 0
                        ? 'trending-up'
                        : difference < 0
                          ? 'trending-down'
                          : 'minus'
                    }
                    size={23}
                    color={
                      difference > 0
                        ? theme.colors.error
                        : theme.colors.primary
                    }
                  />
                </View>
              </View>

              {differencePercent === null ? (
                <View style={{ gap: 8 }}>
                  <Text
                    variant="titleLarge"
                    style={{ fontWeight: '700' }}
                  >
                    Belum ada pembanding
                  </Text>

                  <Text
                    variant="bodyMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      lineHeight: 21,
                    }}
                  >
                    {expense > 0
                      ? 'Tidak ada pengeluaran pada bulan sebelumnya. Persentase perubahan belum dapat dihitung.'
                      : 'Belum ada pengeluaran pada bulan ini dan bulan sebelumnya.'}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: 30,
                      fontWeight: '800',
                      letterSpacing: -0.7,
                      color:
                        difference > 0
                          ? theme.colors.error
                          : theme.colors.primary,
                    }}
                  >
                    {difference > 0
                      ? '+'
                      : difference < 0
                        ? '-'
                        : ''}
                    {differencePercent}%
                  </Text>

                  <Text
                    variant="bodyMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      lineHeight: 21,
                    }}
                  >
                    {difference > 0
                      ? 'Pengeluaran meningkat'
                      : difference < 0
                        ? 'Pengeluaran menurun'
                        : 'Pengeluaran tidak berubah'}
                    {' dibandingkan bulan sebelumnya.'}
                  </Text>

                  <View
                    style={{
                      borderTopWidth:
                        StyleSheet.hairlineWidth,
                      borderTopColor:
                        theme.colors.outlineVariant,
                      paddingTop: 14,
                    }}
                  >
                    <View style={styles.spaceBetween}>
                      <Text
                        variant="bodySmall"
                        style={{
                          color:
                            theme.colors.onSurfaceVariant,
                        }}
                      >
                        Selisih nominal
                      </Text>

                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: '700' }}
                      >
                        {formatSignedRupiah(difference)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </Card.Content>
          </Card>

          {/* =============================================
              FOOTER
          ============================================= */}

          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              alignItems: 'flex-start',
              paddingHorizontal: 4,
              paddingTop: 4,
            }}
          >
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />

            <Text
              variant="bodySmall"
              style={{
                flex: 1,
                color: theme.colors.onSurfaceVariant,
                lineHeight: 19,
              }}
            >
              Analisis dihitung dari transaksi yang
              tersimpan secara lokal di DeyPocket.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 100,
    gap: 18,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },

  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },

  loadingArea: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },

  card: {
    borderRadius: 20,
    overflow: 'hidden',
  },

  metricRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },

  spaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  sectionHeading: {
    marginTop: 10,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  totalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 30,
    paddingHorizontal: 12,
  },
});
