
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
    useCallback,
    useRef,
    useState,
    type ComponentProps,
} from 'react';

import {
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import {
    ActivityIndicator,
    Button,
    Card,
    Chip,
    Dialog,
    Divider,
    IconButton,
    Portal,
    SegmentedButtons,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import {
    createCategory,
    getManagedCategories,
    setCategoryActive,
    updateCategory,
    type ManagedCategory,
} from '../../features/deypocket/category-repository';

import type {
    TransactionKind,
} from '../../features/deypocket/finance-repository';

type IconName =
  ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICON_OPTIONS: {
  name: IconName;
  label: string;
}[] = [
  { name: 'shape-outline', label: 'Umum' },
  { name: 'silverware-fork-knife', label: 'Makanan' },
  { name: 'car-outline', label: 'Transportasi' },
  { name: 'cart-outline', label: 'Belanja' },
  { name: 'receipt-text-outline', label: 'Tagihan' },
  { name: 'movie-outline', label: 'Hiburan' },
  { name: 'medical-bag', label: 'Kesehatan' },
  { name: 'school-outline', label: 'Pendidikan' },
  { name: 'home-outline', label: 'Rumah' },
  { name: 'briefcase-outline', label: 'Kerja' },
  { name: 'cash', label: 'Uang' },
  { name: 'gift-outline', label: 'Hadiah' },
  { name: 'storefront-outline', label: 'Usaha' },
  { name: 'cash-refund', label: 'Refund' },
  { name: 'airplane', label: 'Travel' },
  { name: 'wallet-outline', label: 'Dompet' },
];

const ICON_ALIASES: Record<string, IconName> = {
  food: 'silverware-fork-knife',
  car: 'car-outline',
  shopping: 'cart-outline',
  receipt: 'receipt-text-outline',
  movie: 'movie-outline',
  medical: 'medical-bag',
  school: 'school-outline',
  store: 'storefront-outline',
  gift: 'gift-outline',
  'gift-outline': 'gift-outline',
  cash: 'cash',
  'cash-refund': 'cash-refund',
  'dots-horizontal': 'shape-outline',
};

function resolveIcon(value: string | null): IconName {
  if (!value) return 'shape-outline';

  const known = ICON_OPTIONS.find(
    (item) => item.name === value
  );

  return known?.name ??
    ICON_ALIASES[value] ??
    'shape-outline';
}

function kindLabel(kind: TransactionKind): string {
  return kind === 'income'
    ? 'Pemasukan'
    : 'Pengeluaran';
}

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const savingRef = useRef(false);

  const [categories, setCategories] =
    useState<ManagedCategory[]>([]);

  const [kind, setKind] =
    useState<TransactionKind>('expense');

  const [showArchived, setShowArchived] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // ===================================================
  // EDITOR STATE
  // ===================================================

  const [editorVisible, setEditorVisible] =
    useState(false);

  const [editing, setEditing] =
    useState<ManagedCategory | null>(null);

  const [formKind, setFormKind] =
    useState<TransactionKind>('expense');

  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] =
    useState<IconName>('shape-outline');

  const [formError, setFormError] = useState('');

  // ===================================================
  // ARCHIVE CONFIRMATION
  // ===================================================

  const [archiveTarget, setArchiveTarget] =
    useState<ManagedCategory | null>(null);

  // ===================================================
  // LOAD DATA
  // ===================================================

  const refresh = useCallback(async () => {
    const rows = await getManagedCategories(db);
    setCategories(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setError('');

        try {
          const rows = await getManagedCategories(db);

          if (active) {
            setCategories(rows);
          }
        } catch (err) {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : 'Gagal memuat kategori.'
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [db])
  );

  // ===================================================
  // FILTERS
  // ===================================================

  const currentCategories = categories.filter(
    (item) => item.kind === kind
  );

  const activeCategories = currentCategories.filter(
    (item) => item.is_active === 1
  );

  const archivedCategories = currentCategories.filter(
    (item) => item.is_active === 0
  );

  const visibleCategories = showArchived
    ? archivedCategories
    : activeCategories;

  const totalTransactions = activeCategories.reduce(
    (total, item) => total + item.transaction_count,
    0
  );

  // ===================================================
  // EDITOR ACTIONS
  // ===================================================

  function openCreate() {
    setEditing(null);
    setFormKind(kind);
    setFormName('');
    setFormIcon('shape-outline');
    setFormError('');
    setEditorVisible(true);
  }

  function openEdit(category: ManagedCategory) {
    setEditing(category);
    setFormKind(category.kind);
    setFormName(category.name);
    setFormIcon(resolveIcon(category.icon));
    setFormError('');
    setEditorVisible(true);
  }

  function closeEditor() {
    if (saving) return;

    setEditorVisible(false);
    setFormError('');
  }

  async function handleSave() {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setFormError('');
    setError('');
    setMessage('');

    try {
      const input = {
        kind: formKind,
        name: formName,
        icon: formIcon,
      };

      if (editing) {
        await updateCategory(db, editing.id, input);

        setMessage(
          'Kategori berhasil diperbarui.'
        );
      } else {
        await createCategory(db, input);

        setMessage(
          'Kategori baru berhasil ditambahkan.'
        );
      }

      await refresh();

      setEditorVisible(false);
      setEditing(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan kategori.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // ===================================================
  // ACTIVE STATUS
  // ===================================================

  async function handleSetActive(
    category: ManagedCategory,
    active: boolean
  ) {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await setCategoryActive(
        db,
        category.id,
        active
      );

      await refresh();

      setMessage(
        active
          ? 'Kategori berhasil diaktifkan.'
          : 'Kategori berhasil dinonaktifkan.'
      );

      setArchiveTarget(null);
    } catch (err) {
      setArchiveTarget(null);

      setError(
        err instanceof Error
          ? err.message
          : 'Gagal mengubah status kategori.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Kategori Transaksi',
          headerShown: true,
        }}
      />

      <ScrollView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={{ gap: 5 }}>
          <Text
            variant="labelLarge"
            style={{
              color: theme.colors.primary,
              fontWeight: '800',
              letterSpacing: 1,
            }}
          >
            DEYPOCKET
          </Text>

          <Text
            variant="headlineSmall"
            style={{ fontWeight: '800' }}
          >
            Kategori Transaksi
          </Text>

          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onSurfaceVariant,
            }}
          >
            Atur kategori agar pencatatan keuangan
            tetap terorganisir.
          </Text>
        </View>

        {/* TYPE FILTER */}

        <SegmentedButtons
          value={kind}
          onValueChange={(value) => {
            setKind(
              value === 'income'
                ? 'income'
                : 'expense'
            );

            setShowArchived(false);
            setError('');
            setMessage('');
          }}
          buttons={[
            {
              value: 'expense',
              label: 'Pengeluaran',
              icon: 'arrow-up-right',
            },
            {
              value: 'income',
              label: 'Pemasukan',
              icon: 'arrow-down-left',
            },
          ]}
        />

        {/* SUMMARY */}

        <Card
          mode="contained"
          style={{
            borderRadius: 22,
            backgroundColor:
              theme.colors.primaryContainer,
          }}
        >
          <Card.Content style={styles.summary}>
            <View
              style={{
                flex: 1,
                gap: 5,
              }}
            >
              <Text
                variant="labelMedium"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                }}
              >
                Kategori {kindLabel(kind)}
              </Text>

              <Text
                variant="headlineMedium"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                  fontWeight: '800',
                }}
              >
                {activeCategories.length}
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                }}
              >
                Kategori aktif
              </Text>
            </View>

            <View
              style={{
                alignItems: 'flex-end',
                gap: 6,
              }}
            >
              <Text
                variant="labelMedium"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                }}
              >
                Histori transaksi
              </Text>

              <Text
                variant="titleLarge"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                  fontWeight: '800',
                }}
              >
                {totalTransactions}
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  color:
                    theme.colors.onPrimaryContainer,
                }}
              >
                Pada kategori aktif
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* FILTER + ADD */}

        <View style={styles.filterRow}>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              flexWrap: 'wrap',
              flex: 1,
            }}
          >
            <Chip
              selected={!showArchived}
              onPress={() => setShowArchived(false)}
            >
              Aktif
            </Chip>

            <Chip
              selected={showArchived}
              onPress={() => setShowArchived(true)}
            >
              Nonaktif ({archivedCategories.length})
            </Chip>
          </View>
        </View>

        <Button
          mode="contained"
          icon="plus"
          onPress={openCreate}
          contentStyle={{
            paddingVertical: 7,
          }}
        >
          Tambah Kategori
        </Button>

        {/* FEEDBACK */}

        {!!error && (
          <Card
            mode="outlined"
            style={{
              borderColor: theme.colors.error,
              borderRadius: 16,
            }}
          >
            <Card.Content>
              <Text
                style={{
                  color: theme.colors.error,
                }}
              >
                {error}
              </Text>
            </Card.Content>
          </Card>
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

        {/* LIST */}

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator />

            <Text
              style={{
                color: theme.colors.onSurfaceVariant,
              }}
            >
              Memuat kategori...
            </Text>
          </View>
        )}

        {!loading && visibleCategories.length === 0 && (
          <Card
            mode="outlined"
            style={{ borderRadius: 20 }}
          >
            <Card.Content style={styles.empty}>
              <MaterialCommunityIcons
                name={
                  showArchived
                    ? 'archive-outline'
                    : 'shape-outline'
                }
                size={45}
                color={theme.colors.onSurfaceVariant}
              />

              <Text variant="titleMedium">
                {showArchived
                  ? 'Tidak Ada Kategori Nonaktif'
                  : 'Belum Ada Kategori Aktif'}
              </Text>

              <Text
                variant="bodySmall"
                style={{
                  textAlign: 'center',
                  color:
                    theme.colors.onSurfaceVariant,
                }}
              >
                {showArchived
                  ? 'Kategori yang dinonaktifkan akan tampil di sini.'
                  : 'Tambahkan kategori untuk mulai mengelompokkan transaksi.'}
              </Text>
            </Card.Content>
          </Card>
        )}

        {!loading &&
          visibleCategories.map((category) => {
            const hasUsage =
              category.transaction_count > 0 ||
              category.budget_count > 0;

            const lastActive =
              category.is_active === 1 &&
              activeCategories.length <= 1;

            const cannotArchive =
              hasUsage || lastActive;

            return (
              <Card
                key={category.id}
                mode="outlined"
                style={{
                  borderRadius: 18,
                  backgroundColor:
                    theme.colors.surface,
                  borderColor:
                    theme.colors.outlineVariant,
                }}
              >
                <Card.Content style={{ gap: 12 }}>
                  <View style={styles.categoryRow}>
                    <View
                      style={[
                        styles.categoryIcon,
                        {
                          backgroundColor:
                            theme.colors.primaryContainer,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={resolveIcon(category.icon)}
                        size={24}
                        color={theme.colors.primary}
                      />
                    </View>

                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        gap: 5,
                      }}
                    >
                      <Text
                        variant="titleMedium"
                        numberOfLines={1}
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
                        {category.transaction_count} transaksi
                        {category.budget_count > 0
                          ? ` · ${category.budget_count} anggaran`
                          : ''}
                      </Text>
                    </View>

                    <IconButton
                      icon="pencil-outline"
                      size={21}
                      disabled={saving}
                      onPress={() => openEdit(category)}
                    />
                  </View>

                  <Divider />

                  {category.is_active === 1 ? (
                    <View style={styles.rowBetween}>
                      <Text
                        variant="bodySmall"
                        style={{
                          color:
                            theme.colors.onSurfaceVariant,
                          flex: 1,
                        }}
                      >
                        {hasUsage
                          ? 'Digunakan dalam data keuangan'
                          : lastActive
                            ? 'Minimal satu kategori harus aktif'
                            : 'Belum digunakan'}
                      </Text>

                      <Button
                        mode="text"
                        compact
                        icon="archive-arrow-down-outline"
                        disabled={saving || cannotArchive}
                        onPress={() =>
                          setArchiveTarget(category)
                        }
                      >
                        Nonaktifkan
                      </Button>
                    </View>
                  ) : (
                    <View style={styles.rowBetween}>
                      <Text
                        variant="bodySmall"
                        style={{
                          color:
                            theme.colors.onSurfaceVariant,
                        }}
                      >
                        Kategori nonaktif
                      </Text>

                      <Button
                        mode="text"
                        compact
                        icon="restore"
                        disabled={saving}
                        onPress={() =>
                          void handleSetActive(
                            category,
                            true
                          )
                        }
                      >
                        Aktifkan
                      </Button>
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
          })}
      </ScrollView>

      {/* =================================================
          CREATE / EDIT DIALOG
      ================================================= */}

      <Portal>
        <Dialog
          visible={editorVisible}
          onDismiss={closeEditor}
          style={styles.dialog}
        >
          <Dialog.Title>
            {editing
              ? 'Ubah Kategori'
              : 'Tambah Kategori'}
          </Dialog.Title>

          <Dialog.ScrollArea
            style={{ maxHeight: 440 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingVertical: 14,
                gap: 18,
              }}
            >
              <View style={{ gap: 6 }}>
                <Text variant="labelLarge">
                  Jenis Kategori
                </Text>

                <SegmentedButtons
                  value={formKind}
                  onValueChange={(value) => {
                    if (editing) return;

                    setFormKind(
                      value === 'income'
                        ? 'income'
                        : 'expense'
                    );
                  }}
                  buttons={[
                    {
                      value: 'expense',
                      label: 'Keluar',
                    },
                    {
                      value: 'income',
                      label: 'Masuk',
                    },
                  ]}
                  density="small"
                  style={{
                    opacity: editing ? 0.65 : 1,
                  }}
                />

                {!!editing && (
                  <Text
                    variant="bodySmall"
                    style={{
                      color:
                        theme.colors.onSurfaceVariant,
                    }}
                  >
                    Jenis kategori dikunci setelah dibuat.
                  </Text>
                )}
              </View>

              <TextInput
                mode="outlined"
                label="Nama Kategori"
                value={formName}
                onChangeText={setFormName}
                maxLength={50}
                placeholder="Contoh: Kopi & Nongkrong"
                autoCapitalize="words"
              />

              <View style={{ gap: 12 }}>
                <Text variant="labelLarge">
                  Pilih Ikon
                </Text>

                <View style={styles.iconGrid}>
                  {ICON_OPTIONS.map((option) => {
                    const selected =
                      option.name === formIcon;

                    return (
                      <Pressable
                        key={option.name}
                        accessibilityRole="button"
                        accessibilityLabel={
                          `Ikon ${option.label}`
                        }
                        accessibilityState={{ selected }}
                        onPress={() =>
                          setFormIcon(option.name)
                        }
                        style={({ pressed }) => [
                          styles.iconChoice,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                            borderColor: selected
                              ? theme.colors.primary
                              : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={option.name}
                          size={23}
                          color={selected
                            ? theme.colors.primary
                            : theme.colors.onSurfaceVariant}
                        />

                        <Text
                          variant="labelSmall"
                          numberOfLines={1}
                          style={{
                            color: selected
                              ? theme.colors.primary
                              : theme.colors.onSurfaceVariant,
                          }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {!!formError && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.error }}
                >
                  {formError}
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button
              disabled={saving}
              onPress={closeEditor}
            >
              Batal
            </Button>

            <Button
              mode="contained"
              loading={saving}
              disabled={
                saving ||
                formName.trim().length < 2
              }
              onPress={() => void handleSave()}
            >
              Simpan
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ARCHIVE CONFIRMATION */}

        <Dialog
          visible={archiveTarget !== null}
          onDismiss={() => {
            if (!saving) {
              setArchiveTarget(null);
            }
          }}
        >
          <Dialog.Title>
            Nonaktifkan kategori?
          </Dialog.Title>

          <Dialog.Content>
            <Text variant="bodyMedium">
              Kategori "{archiveTarget?.name}" tidak akan
              muncul pada pilihan transaksi baru.
              Kategori bisa diaktifkan kembali.
            </Text>
          </Dialog.Content>

          <Dialog.Actions>
            <Button
              disabled={saving}
              onPress={() => setArchiveTarget(null)}
            >
              Batal
            </Button>

            <Button
              loading={saving}
              disabled={saving}
              onPress={() => {
                if (!archiveTarget) return;

                void handleSetActive(
                  archiveTarget,
                  false
                );
              }}
            >
              Nonaktifkan
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 90,
    gap: 18,
  },

  summary: {
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },

  iconChoice: {
    width: 70,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
    gap: 5,
  },

  dialog: {
    alignSelf: 'center',
    width: '94%',
    maxWidth: 500,
  },

  loading: {
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 12,
  },
});
