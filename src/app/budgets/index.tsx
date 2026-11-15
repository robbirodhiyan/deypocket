
import { useCallback, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
    ActivityIndicator,
    Button,
    Card,
    HelperText,
    IconButton,
    ProgressBar,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import {
    formatMonthLabel,
    getBudgetOverview,
    getCurrentMonth,
    moveMonth,
    saveMonthlyBudgets,
    type BudgetInput,
    type BudgetOverview,
} from '../../features/deypocket/budget-repository';

import { formatRupiah } from '../../features/deypocket/format';

// =====================================================
// HELPERS
// =====================================================

function normalizeDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function parseBudget(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }

  const numeric = Number(value);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0 ||
    numeric > 1_000_000_000_000
  ) {
    throw new Error('Nominal anggaran tidak valid.');
  }

  return numeric;
}

function budgetProgress(
  spent: number,
  limit: number
): number {
  if (limit === 0) {
    return spent > 0 ? 1 : 0;
  }

  return Math.min(Math.max(spent / limit, 0), 1);
}

// =====================================================
// SCREEN
// =====================================================

export default function BudgetsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const savingRef = useRef(false);

  // ===================================================
  // STATE
  // ===================================================

  const [month, setMonth] = useState(getCurrentMonth);

  const [overview, setOverview] =
    useState<BudgetOverview | null>(null);

  const [overallInput, setOverallInput] = useState('');

  const [categoryInputs, setCategoryInputs] =
    useState<Record<number, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // ===================================================
  // APPLY DATA TO FORM
  // ===================================================

  const applyOverview = useCallback(
    (data: BudgetOverview) => {
      setOverview(data);

      setOverallInput(
        data.overall_limit_rupiah === null
          ? ''
          : String(data.overall_limit_rupiah)
      );

      const inputs: Record<number, string> = {};

      for (const category of data.categories) {
        inputs[category.category_id] =
          category.limit_rupiah === null
            ? ''
            : String(category.limit_rupiah);
      }

      setCategoryInputs(inputs);
    },
    []
  );

  // ===================================================
  // LOAD MONTHLY BUDGET
  // ===================================================

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadBudget() {
        setLoading(true);
        setError('');
        setMessage('');
        setOverview(null);

        try {
          const data = await getBudgetOverview(db, month);

          if (active) {
            applyOverview(data);
          }
        } catch (err) {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : 'Gagal memuat anggaran.'
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void loadBudget();

      return () => {
        active = false;
      };
    }, [db, month, applyOverview])
  );

  // ===================================================
  // CALCULATIONS
  // ===================================================

  // FIX:
  // number | null, bukan number | null | undefined.
  const overallLimit =
    overview?.overall_limit_rupiah ?? null;

  const totalSpent =
    overview?.expense ?? 0;

  const remainingBudget =
    overallLimit === null
      ? null
      : overallLimit - totalSpent;

  const isOverBudget =
    overallLimit !== null &&
    totalSpent > overallLimit;

  const totalCategoryBudget =
    overview?.categories.reduce((total, category) => {
      const input =
        categoryInputs[category.category_id] ?? '';

      const numeric = Number(input || 0);

      return total + (
        Number.isSafeInteger(numeric) &&
        numeric >= 0
          ? numeric
          : 0
      );
    }, 0) ?? 0;

  // ===================================================
  // SAVE
  // ===================================================

  async function handleSave() {
    if (
      savingRef.current ||
      !overview ||
      loading
    ) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const entries: BudgetInput[] = [
        {
          categoryId: null,
          limitRupiah: parseBudget(overallInput),
        },
      ];

      for (const category of overview.categories) {
        entries.push({
          categoryId: category.category_id,
          limitRupiah: parseBudget(
            categoryInputs[category.category_id] ?? ''
          ),
        });
      }

      await saveMonthlyBudgets(db, month, entries);

      const refreshed =
        await getBudgetOverview(db, month);

      applyOverview(refreshed);

      setMessage('Anggaran berhasil disimpan.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan anggaran.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Anggaran Bulanan',
          headerShown: true,
        }}
      />

      <ScrollView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={{ gap: 5 }}>
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
            variant="headlineSmall"
            style={{ fontWeight: '800' }}
          >
            Anggaran Bulanan
          </Text>

          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onSurfaceVariant,
            }}
          >
            Tentukan batas pengeluaran agar keuangan
            lebih terkontrol.
          </Text>
        </View>

        {/* MONTH SELECTOR */}

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
            disabled={saving || loading}
            onPress={() =>
              setMonth((value) => moveMonth(value, -1))
            }
          />

          <View
            style={{
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text
              variant="labelSmall"
              style={{
                color: theme.colors.onSurfaceVariant,
              }}
            >
              PERIODE ANGGARAN
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
            disabled={saving || loading}
            onPress={() =>
              setMonth((value) => moveMonth(value, 1))
            }
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
              Memuat anggaran...
            </Text>
          </View>
        )}

        {/* LOAD ERROR */}

        {!loading && !overview && !!error && (
          <Card mode="outlined" style={styles.card}>
            <Card.Content>
              <HelperText type="error" visible>
                {error}
              </HelperText>
            </Card.Content>
          </Card>
        )}

        {/* CONTENT */}

        {!loading && overview && (
          <>
            {/* ANGGARAN KESELURUHAN */}

            <Card
              mode="contained"
              style={{
                borderRadius: 22,
                backgroundColor:
                  theme.colors.primaryContainer,
              }}
            >
              <Card.Content style={{ gap: 16 }}>
                <Text
                  variant="titleLarge"
                  style={{
                    fontWeight: '800',
                    color:
                      theme.colors.onPrimaryContainer,
                  }}
                >
                  Anggaran Keseluruhan
                </Text>

                <TextInput
                  mode="outlined"
                  label="Batas pengeluaran (Rp)"
                  value={overallInput}
                  onChangeText={(value) =>
                    setOverallInput(normalizeDigits(value))
                  }
                  keyboardType="number-pad"
                  placeholder="Contoh: 3000000"
                />

                <View style={{ gap: 6 }}>
                  <Text
                    variant="labelMedium"
                    style={{
                      color:
                        theme.colors.onPrimaryContainer,
                    }}
                  >
                    Pengeluaran Bulan Ini
                  </Text>

                  <Text
                    variant="headlineSmall"
                    style={{
                      fontWeight: '800',
                      color:
                        theme.colors.onPrimaryContainer,
                    }}
                  >
                    {formatRupiah(totalSpent)}
                  </Text>
                </View>

                {overallLimit === null ? (
                  <Text
                    variant="bodyMedium"
                    style={{
                      color:
                        theme.colors.onPrimaryContainer,
                    }}
                  >
                    Belum ada batas anggaran tersimpan.
                  </Text>
                ) : (
                  <>
                    <ProgressBar
                      progress={budgetProgress(
                        totalSpent,
                        overallLimit
                      )}
                      color={
                        isOverBudget
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
                        variant="bodySmall"
                        style={{
                          color:
                            theme.colors.onPrimaryContainer,
                        }}
                      >
                        Dari{' '}
                        {formatRupiah(overallLimit)}
                      </Text>

                      <Text
                        variant="bodySmall"
                        style={{
                          color: isOverBudget
                            ? theme.colors.error
                            : theme.colors.onPrimaryContainer,
                          fontWeight: '700',
                        }}
                      >
                        {isOverBudget
                          ? `Lebih ${formatRupiah(
                              totalSpent - overallLimit
                            )}`
                          : `Sisa ${formatRupiah(
                              overallLimit - totalSpent
                            )}`}
                      </Text>
                    </View>
                  </>
                )}

                <HelperText type="info" visible>
                  Kosongkan nominal untuk menghapus
                  batas anggaran. Isi 0 untuk batas Rp0.
                </HelperText>
              </Card.Content>
            </Card>

            {/* KATEGORI */}

            <View style={{ gap: 5 }}>
              <Text
                variant="titleLarge"
                style={{ fontWeight: '800' }}
              >
                Anggaran per Kategori
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                Atur batas untuk setiap jenis pengeluaran.
                Kategori boleh dikosongkan.
              </Text>
            </View>

            {overview.categories.map((category) => {
              const limit = category.limit_rupiah;
              const spent = category.spent_rupiah;

              const categoryOverBudget =
                limit !== null && spent > limit;

              return (
                <Card
                  key={category.category_id}
                  mode="outlined"
                  style={[
                    styles.card,
                    {
                      backgroundColor:
                        theme.colors.surface,
                      borderColor:
                        theme.colors.outlineVariant,
                    },
                  ]}
                >
                  <Card.Content style={{ gap: 14 }}>
                    <View style={styles.categoryHeader}>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 100,
                          gap: 5,
                        }}
                      >
                        <Text
                          variant="titleMedium"
                          style={{ fontWeight: '700' }}
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
                          Terpakai: {formatRupiah(spent)}
                        </Text>

                        {category.is_active === 0 && (
                          <Text
                            variant="bodySmall"
                            style={{
                              color: theme.colors.error,
                            }}
                          >
                            Kategori nonaktif
                          </Text>
                        )}
                      </View>

                      <TextInput
                        mode="outlined"
                        label="Budget (Rp)"
                        dense
                        keyboardType="number-pad"
                        value={
                          categoryInputs[
                            category.category_id
                          ] ?? ''
                        }
                        onChangeText={(value) =>
                          setCategoryInputs(
                            (previous) => ({
                              ...previous,
                              [category.category_id]:
                                normalizeDigits(value),
                            })
                          )
                        }
                        style={{ width: 150 }}
                      />
                    </View>

                    {limit !== null && (
                      <>
                        <ProgressBar
                          progress={budgetProgress(
                            spent,
                            limit
                          )}
                          color={
                            categoryOverBudget
                              ? theme.colors.error
                              : theme.colors.primary
                          }
                          style={{
                            height: 8,
                            borderRadius: 8,
                          }}
                        />

                        <View style={styles.rowBetween}>
                          <Text
                            variant="bodySmall"
                            style={{
                              color:
                                theme.colors.onSurfaceVariant,
                            }}
                          >
                            Batas: {formatRupiah(limit)}
                          </Text>

                          <Text
                            variant="bodySmall"
                            style={{
                              color: categoryOverBudget
                                ? theme.colors.error
                                : theme.colors.primary,
                              fontWeight: '700',
                            }}
                          >
                            {categoryOverBudget
                              ? `Lebih ${formatRupiah(
                                  spent - limit
                                )}`
                              : `Sisa ${formatRupiah(
                                  limit - spent
                                )}`}
                          </Text>
                        </View>
                      </>
                    )}
                  </Card.Content>
                </Card>
              );
            })}

            {/* TOTAL KATEGORI */}

            <Card
              mode="contained"
              style={{ borderRadius: 20 }}
            >
              <Card.Content style={{ gap: 8 }}>
                <Text variant="labelLarge">
                  Total Batas Anggaran Kategori
                </Text>

                <Text
                  variant="headlineSmall"
                  style={{ fontWeight: '800' }}
                >
                  {formatRupiah(totalCategoryBudget)}
                </Text>

                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                  }}
                >
                  Total batas kategori dihitung terpisah.
                  Nilainya tidak ditambahkan ke anggaran
                  keseluruhan.
                </Text>
              </Card.Content>
            </Card>

            {/* FEEDBACK */}

            {!!error && (
              <HelperText type="error" visible>
                {error}
              </HelperText>
            )}

            {!!message && (
              <Text
                variant="bodyMedium"
                style={{
                  color: theme.colors.primary,
                  fontWeight: '600',
                }}
              >
                {message}
              </Text>
            )}

            {/* SAVE */}

            <Button
              mode="contained"
              icon="content-save-outline"
              loading={saving}
              disabled={saving}
              onPress={() => void handleSave()}
              contentStyle={{ paddingVertical: 8 }}
            >
              Simpan Anggaran
            </Button>

            {/* INFO */}

            {remainingBudget !== null && (
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: 'center',
                }}
              >
                Anggaran tidak mengubah saldo dompet.
                Nilai pengeluaran berasal dari histori
                transaksi pada bulan yang dipilih.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </>
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
    paddingBottom: 70,
    gap: 18,
  },

  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },

  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },

  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  card: {
    borderRadius: 20,
  },

  loading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
