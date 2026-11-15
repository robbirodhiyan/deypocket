
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Pressable,
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
  getActivities,
  getFinanceSummary,
  type FinanceActivity,
  type FinanceSummary,
} from '../../features/deypocket/finance-repository';

import {
  formatMonthLabel,
  getBudgetOverview,
  getCurrentMonth,
  type BudgetOverview,
} from '../../features/deypocket/budget-repository';

import { formatRupiah } from '../../features/deypocket/format';

// =====================================================
// HELPERS
// =====================================================

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}

function formatActivityDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return value;

  const [, year, month, day] = match;

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(
    new Date(Number(year), Number(month) - 1, Number(day))
  );
}

function activityIcon(kind: FinanceActivity['kind']) {
  if (kind === 'income') return 'arrow-down-left' as const;
  if (kind === 'expense') return 'arrow-up-right' as const;
  return 'swap-horizontal' as const;
}

function categoryIcon(name: string) {
  const text = name.toLowerCase();

  if (text.includes('makan') || text.includes('minum')) {
    return 'silverware-fork-knife' as const;
  }

  if (text.includes('transport')) {
    return 'car-outline' as const;
  }

  if (text.includes('belanja')) {
    return 'cart-outline' as const;
  }

  if (text.includes('tagihan')) {
    return 'receipt-text-outline' as const;
  }

  if (text.includes('hiburan')) {
    return 'movie-outline' as const;
  }

  if (text.includes('kesehatan')) {
    return 'medical-bag' as const;
  }

  if (text.includes('pendidikan')) {
    return 'school-outline' as const;
  }

  return 'shape-outline' as const;
}

// =====================================================
// DASHBOARD
// =====================================================

export default function HomeScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const { width } = useWindowDimensions();
  const compact = width < 390;

  const [summary, setSummary] = useState<FinanceSummary>({
    balance: 0,
    income: 0,
    expense: 0,
  });

  const [recent, setRecent] = useState<FinanceActivity[]>([]);
  const [budget, setBudget] =
    useState<BudgetOverview | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // ===================================================
  // LOAD DATA
  // ===================================================

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadDashboard() {
        setLoading(true);
        setError('');

        try {
          const [totals, activities, currentBudget] =
            await Promise.all([
              getFinanceSummary(db),
              getActivities(db, 5),
              getBudgetOverview(db, getCurrentMonth()),
            ]);

          if (!active) return;

          setSummary(totals);
          setRecent(activities);
          setBudget(currentBudget);
        } catch (err) {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : 'Gagal memuat dashboard.'
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadDashboard();

      return () => {
        active = false;
      };
    }, [db, reloadKey])
  );

  // ===================================================
  // CALCULATIONS
  // ===================================================

  const budgetLimit = budget?.overall_limit_rupiah ?? null;
  const budgetSpent = budget?.expense ?? 0;

  const hasBudget = budgetLimit !== null;

  const budgetProgress =
    budgetLimit === null
      ? 0
      : budgetLimit === 0
        ? budgetSpent > 0
          ? 1
          : 0
        : clamp(budgetSpent / budgetLimit);

  const budgetPercent =
    budgetLimit === null
      ? 0
      : budgetLimit === 0
        ? budgetSpent > 0
          ? 100
          : 0
        : Math.round((budgetSpent / budgetLimit) * 100);

  const remainingBudget =
    budgetLimit === null ? 0 : budgetLimit - budgetSpent;

  const overBudget =
    budgetLimit !== null && remainingBudget < 0;

  const topCategories =
    budget?.categories
      .filter((item) => item.spent_rupiah > 0)
      .sort((a, b) => b.spent_rupiah - a.spent_rupiah)
      .slice(0, 3) ?? [];

  const showContent =
    !loading && error.length === 0 && budget !== null;

  // ===================================================
  // QUICK ACTIONS
  // ===================================================

  const quickActions = [
    {
      title: 'Catat',
      icon: 'plus-circle-outline' as const,
      onPress: () => router.push('/transaction/add'),
    },
    {
      title: 'Dompet',
      icon: 'wallet-outline' as const,
      onPress: () => router.push('/accounts'),
    },
    {
      title: 'Anggaran',
      icon: 'chart-donut' as const,
      onPress: () => router.push('/budgets'),
    },
  ];

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              variant="labelLarge"
              style={{
                color: theme.colors.primary,
                fontWeight: '800',
                letterSpacing: 1.1,
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
              Keuanganmu, sekilas.
            </Text>

            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurfaceVariant,
              }}
            >
              Ringkasan {formatMonthLabel(getCurrentMonth())}
            </Text>
          </View>

          <IconButton
            icon="refresh"
            size={22}
            disabled={loading}
            onPress={() =>
              setReloadKey((value) => value + 1)
            }
            style={{
              margin: 0,
              backgroundColor: theme.colors.surfaceVariant,
            }}
          />
        </View>

        {/* LOADING */}

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />

            <Text
              style={{
                color: theme.colors.onSurfaceVariant,
              }}
            >
              Memuat ringkasan keuangan...
            </Text>
          </View>
        )}

        {/* ERROR */}

        {!loading && !!error && (
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.emptyState}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={42}
                color={theme.colors.error}
              />

              <Text variant="titleMedium">
                Dashboard Tidak Tersedia
              </Text>

              <Text
                variant="bodyMedium"
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

        {/* CONTENT */}

        {showContent && (
          <>
            {/* TOTAL SALDO */}

            <View
              style={[
                styles.hero,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <View
                pointerEvents="none"
                style={styles.heroCircleLarge}
              />

              <View
                pointerEvents="none"
                style={styles.heroCircleSmall}
              />

              <View style={styles.heroContent}>
                <View style={styles.rowBetween}>
                  <Text
                    variant="titleSmall"
                    style={{
                      color: theme.colors.onPrimary,
                      opacity: 0.85,
                    }}
                  >
                    Total Saldo
                  </Text>

                  <View style={styles.heroIcon}>
                    <MaterialCommunityIcons
                      name="wallet-outline"
                      size={22}
                      color={theme.colors.onPrimary}
                    />
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: theme.colors.onPrimary,
                      fontSize: compact ? 29 : 36,
                      fontWeight: '800',
                      letterSpacing: -1,
                    }}
                  >
                    {formatRupiah(summary.balance)}
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={16}
                      color={theme.colors.onPrimary}
                    />

                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onPrimary,
                        opacity: 0.82,
                      }}
                    >
                      Saldo gabungan seluruh dompet aktif
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* PEMASUKAN & PENGELUARAN */}

            <View style={styles.metricRow}>
              <Card
                mode="outlined"
                style={[
                  styles.metricCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
              >
                <Card.Content style={styles.metricContent}>
                  <View
                    style={[
                      styles.metricIcon,
                      {
                        backgroundColor:
                          theme.colors.primaryContainer,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="arrow-down-left"
                      size={22}
                      color={theme.colors.primary}
                    />
                  </View>

                  <Text
                    variant="labelMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                    }}
                  >
                    Pemasukan
                  </Text>

                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[
                      styles.metricValue,
                      { fontSize: compact ? 16 : 19 },
                    ]}
                  >
                    {formatRupiah(summary.income)}
                  </Text>
                </Card.Content>
              </Card>

              <Card
                mode="outlined"
                style={[
                  styles.metricCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
              >
                <Card.Content style={styles.metricContent}>
                  <View
                    style={[
                      styles.metricIcon,
                      {
                        backgroundColor:
                          theme.colors.errorContainer,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="arrow-up-right"
                      size={22}
                      color={theme.colors.error}
                    />
                  </View>

                  <Text
                    variant="labelMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                    }}
                  >
                    Pengeluaran
                  </Text>

                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[
                      styles.metricValue,
                      { fontSize: compact ? 16 : 19 },
                    ]}
                  >
                    {formatRupiah(summary.expense)}
                  </Text>
                </Card.Content>
              </Card>
            </View>

            {/* AKSES CEPAT */}

            <View style={{ gap: 12 }}>
              <Text
                variant="titleLarge"
                style={styles.sectionTitle}
              >
                Akses Cepat
              </Text>

              <View style={styles.quickActions}>
                {quickActions.map((action) => (
                  <Pressable
                    key={action.title}
                    accessibilityRole="button"
                    accessibilityLabel={action.title}
                    onPress={action.onPress}
                    style={({ pressed }) => [
                      styles.quickAction,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor:
                          theme.colors.outlineVariant,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.quickIcon,
                        {
                          backgroundColor:
                            theme.colors.primaryContainer,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={action.icon}
                        size={23}
                        color={theme.colors.primary}
                      />
                    </View>

                    <Text
                      variant="labelLarge"
                      numberOfLines={1}
                    >
                      {action.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ANGGARAN BULANAN */}

            <View style={styles.sectionHeader}>
              <Text
                variant="titleLarge"
                style={styles.sectionTitle}
              >
                Anggaran Bulanan
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push('/budgets')
                }
              >
                <Text
                  variant="labelLarge"
                  style={{ color: theme.colors.primary }}
                >
                  Kelola
                </Text>
              </Pressable>
            </View>

            <Card
              mode="outlined"
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Card.Content style={{ gap: 17 }}>
                <View style={styles.rowBetween}>
                  <View
                    style={[
                      styles.sectionIcon,
                      {
                        backgroundColor:
                          theme.colors.primaryContainer,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chart-donut"
                      size={23}
                      color={theme.colors.primary}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="titleMedium">
                      Budget {formatMonthLabel(getCurrentMonth())}
                    </Text>

                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      Pantau batas pengeluaranmu
                    </Text>
                  </View>
                </View>

                {!hasBudget ? (
                  <View style={{ gap: 12 }}>
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      Belum ada anggaran keseluruhan
                      untuk bulan ini.
                    </Text>

                    <Button
                      mode="contained-tonal"
                      icon="plus"
                      onPress={() =>
                        router.push('/budgets')
                      }
                    >
                      Buat Anggaran
                    </Button>
                  </View>
                ) : (
                  <>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text
                          variant="bodySmall"
                          style={{
                            color:
                              theme.colors.onSurfaceVariant,
                          }}
                        >
                          Sudah Digunakan
                        </Text>

                        <Text
                          variant="titleLarge"
                          style={{ fontWeight: '800' }}
                        >
                          {formatRupiah(budgetSpent)}
                        </Text>
                      </View>

                      <View
                        style={{
                          alignItems: 'flex-end',
                          gap: 5,
                        }}
                      >
                        <Text
                          variant="bodySmall"
                          style={{
                            color:
                              theme.colors.onSurfaceVariant,
                          }}
                        >
                          Dari Anggaran
                        </Text>

                        <Text
                          variant="titleMedium"
                          style={{ fontWeight: '700' }}
                        >
                          {formatRupiah(budgetLimit ?? 0)}
                        </Text>
                      </View>
                    </View>

                    <ProgressBar
                      progress={budgetProgress}
                      color={
                        overBudget
                          ? theme.colors.error
                          : theme.colors.primary
                      }
                      style={{
                        height: 10,
                        borderRadius: 10,
                      }}
                    />

                    <View style={styles.rowBetween}>
                      <Text
                        variant="labelSmall"
                        style={{
                          color: overBudget
                            ? theme.colors.error
                            : theme.colors.onSurfaceVariant,
                        }}
                      >
                        {budgetPercent}% terpakai
                      </Text>

                      <Text
                        variant="labelSmall"
                        style={{
                          color: overBudget
                            ? theme.colors.error
                            : theme.colors.primary,
                          fontWeight: '700',
                        }}
                      >
                        {overBudget
                          ? `Lebih ${formatRupiah(
                              Math.abs(remainingBudget)
                            )}`
                          : `Sisa ${formatRupiah(
                              remainingBudget
                            )}`}
                      </Text>
                    </View>
                  </>
                )}
              </Card.Content>
            </Card>

            {/* KATEGORI TERBESAR */}

            {topCategories.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text
                    variant="titleLarge"
                    style={styles.sectionTitle}
                  >
                    Pengeluaran Terbesar
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.navigate('/insights')
                    }
                  >
                    <Text
                      variant="labelLarge"
                      style={{ color: theme.colors.primary }}
                    >
                      Lihat Insight
                    </Text>
                  </Pressable>
                </View>

                <Card
                  mode="outlined"
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor:
                        theme.colors.outlineVariant,
                    },
                  ]}
                >
                  <Card.Content style={{ gap: 20 }}>
                    {topCategories.map((category) => {
                      const progress =
                        summary.expense > 0
                          ? clamp(
                              category.spent_rupiah /
                                summary.expense
                            )
                          : 0;

                      const percentage = Math.round(
                        progress * 100
                      );

                      return (
                        <View
                          key={category.category_id}
                          style={{ gap: 9 }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
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
                                size={21}
                                color={theme.colors.primary}
                              />
                            </View>

                            <View
                              style={{ flex: 1, gap: 4 }}
                            >
                              <Text
                                variant="titleSmall"
                                numberOfLines={1}
                              >
                                {category.name}
                              </Text>

                              <Text
                                variant="bodySmall"
                                style={{
                                  color:
                                    theme.colors.onSurfaceVariant,
                                }}
                              >
                                {percentage}% dari pengeluaran
                              </Text>
                            </View>

                            <Text
                              variant="titleSmall"
                              style={{ fontWeight: '700' }}
                            >
                              {formatRupiah(
                                category.spent_rupiah
                              )}
                            </Text>
                          </View>

                          <ProgressBar
                            progress={progress}
                            color={theme.colors.primary}
                            style={{
                              height: 6,
                              borderRadius: 6,
                            }}
                          />
                        </View>
                      );
                    })}
                  </Card.Content>
                </Card>
              </>
            )}

            {/* TRANSAKSI TERAKHIR */}

            <View style={styles.sectionHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  variant="titleLarge"
                  style={styles.sectionTitle}
                >
                  Transaksi Terakhir
                </Text>

                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                  }}
                >
                  Aktivitas keuangan terbaru
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.navigate('/transactions')
                }
              >
                <Text
                  variant="labelLarge"
                  style={{ color: theme.colors.primary }}
                >
                  Lihat Semua
                </Text>
              </Pressable>
            </View>

            <Card
              mode="outlined"
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Card.Content style={{ paddingVertical: 4 }}>
                {recent.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons
                      name="receipt-text-outline"
                      size={45}
                      color={theme.colors.onSurfaceVariant}
                    />

                    <Text variant="titleMedium">
                      Belum Ada Transaksi
                    </Text>

                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        textAlign: 'center',
                      }}
                    >
                      Mulai mencatat pemasukan dan
                      pengeluaran pertamamu.
                    </Text>

                    <Button
                      mode="contained"
                      icon="plus"
                      onPress={() =>
                        router.push('/transaction/add')
                      }
                    >
                      Tambah Transaksi
                    </Button>
                  </View>
                ) : (
                  recent.map((item, index) => {
                    const isIncome = item.kind === 'income';
                    const isExpense = item.kind === 'expense';

                    const iconColor = isIncome
                      ? theme.colors.primary
                      : isExpense
                        ? theme.colors.error
                        : theme.colors.secondary;

                    const iconBackground = isIncome
                      ? theme.colors.primaryContainer
                      : isExpense
                        ? theme.colors.errorContainer
                        : theme.colors.secondaryContainer;

                    const sign = isIncome
                      ? '+'
                      : isExpense
                        ? '-'
                        : '';

                    return (
                      <Pressable
                        key={`${item.kind}-${item.id}`}
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: '/transaction/detail',
                            params: {
                              id: String(item.id),
                              kind: item.kind,
                            },
                          })
                        }
                        style={({ pressed }) => ({
                          paddingVertical: 15,
                          opacity: pressed ? 0.65 : 1,
                          borderBottomWidth:
                            index === recent.length - 1
                              ? 0
                              : StyleSheet.hairlineWidth,
                          borderBottomColor:
                            theme.colors.outlineVariant,
                        })}
                      >
                        <View style={styles.activityRow}>
                          <View
                            style={[
                              styles.activityIcon,
                              {
                                backgroundColor:
                                  iconBackground,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={activityIcon(item.kind)}
                              size={22}
                              color={iconColor}
                            />
                          </View>

                          <View
                            style={{ flex: 1, gap: 4 }}
                          >
                            <Text
                              variant="titleSmall"
                              numberOfLines={1}
                              style={{ fontWeight: '700' }}
                            >
                              {item.title}
                            </Text>

                            <Text
                              variant="bodySmall"
                              numberOfLines={1}
                              style={{
                                color:
                                  theme.colors.onSurfaceVariant,
                              }}
                            >
                              {item.account_name}
                              {' · '}
                              {formatActivityDate(
                                item.occurred_on
                              )}
                            </Text>
                          </View>

                          <View
                            style={{
                              alignItems: 'flex-end',
                              gap: 4,
                              maxWidth: '45%',
                            }}
                          >
                            <Text
                              variant="titleSmall"
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              style={{
                                color: iconColor,
                                fontWeight: '800',
                              }}
                            >
                              {sign}
                              {formatRupiah(
                                item.amount_rupiah
                              )}
                            </Text>

                            <MaterialCommunityIcons
                              name="chevron-right"
                              size={17}
                              color={
                                theme.colors.onSurfaceVariant
                              }
                            />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </Card.Content>
            </Card>

            {/* FOOTER */}

            <View style={styles.footer}>
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={17}
                color={theme.colors.onSurfaceVariant}
              />

              <Text
                variant="bodySmall"
                style={{
                  flex: 1,
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                Data keuangan tersimpan secara lokal
                di perangkatmu.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 90,
    gap: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },

  hero: {
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 190,
  },

  heroContent: {
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 27,
    zIndex: 1,
  },

  heroCircleLarge: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.075)',
    right: -65,
    top: -75,
  },

  heroCircleSmall: {
    position: 'absolute',
    width: 125,
    height: 125,
    borderRadius: 63,
    backgroundColor: 'rgba(255,255,255,0.055)',
    right: 25,
    bottom: -85,
  },

  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },

  metricCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
  },

  metricContent: {
    paddingHorizontal: 15,
    paddingVertical: 17,
    gap: 11,
  },

  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metricValue: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },

  quickAction: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 5,
    alignItems: 'center',
    gap: 10,
  },

  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },

  sectionTitle: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  card: {
    borderRadius: 20,
    overflow: 'hidden',
  },

  sectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loading: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 35,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
});
