
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import {
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    Button,
    Card,
    Dialog,
    HelperText,
    IconButton,
    Portal,
    Searchbar,
    Snackbar,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import {
    Database,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react-native';

import {
    createItem,
    deleteItem,
    getItems,
    updateItem,
    type Item,
} from '@/repositories/item-repository';

export default function DataScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [error, setError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const result = await getItems(db, search);
    setItems(result);
  }, [db, search]);

  // Muat data setiap halaman aktif atau kata pencarian berubah.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoading(true);

      getItems(db, search)
        .then((rows) => {
          if (active) setItems(rows);
        })
        .catch((err) => {
          console.error('SQLite SELECT:', err);
          if (active) setMessage('Gagal membaca database.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [db, search])
  );

  function openAdd() {
    setEditing(null);
    setName('');
    setSku('');
    setError('');
    setFormVisible(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setName(item.name);
    setSku(item.sku);
    setError('');
    setFormVisible(true);
  }

  function closeForm() {
    if (saving) return;

    setFormVisible(false);
    setEditing(null);
    setName('');
    setSku('');
    setError('');
  }

  async function handleSave() {
    if (saving) return;

    const cleanName = name.trim();
    const cleanSku = sku.trim();

    if (!cleanName || !cleanSku) {
      setError('Nama dan kode barang wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editing) {
        await updateItem(db, editing.id, {
          name: cleanName,
          sku: cleanSku,
        });
      } else {
        await createItem(db, {
          name: cleanName,
          sku: cleanSku,
        });
      }

      await refresh();
      closeFormAfterSave();

      setMessage('Data berhasil disimpan.');
    } catch (err) {
      console.error('SQLite SAVE:', err);

      const detail = String(err).toUpperCase();

      if (
        detail.includes('UNIQUE') ||
        detail.includes('SQLITE_CONSTRAINT')
      ) {
        setError('Kode barang sudah digunakan.');
      } else {
        setError('Gagal menyimpan data ke SQLite.');
      }
    } finally {
      setSaving(false);
    }
  }

  function closeFormAfterSave() {
    setFormVisible(false);
    setEditing(null);
    setName('');
    setSku('');
    setError('');
  }

  async function handleDelete() {
    if (!deleteTarget || saving) return;

    setSaving(true);

    try {
      await deleteItem(db, deleteTarget.id);
      await refresh();

      setDeleteTarget(null);
      setMessage('Data berhasil dihapus.');
    } catch (err) {
      console.error('SQLite DELETE:', err);
      setMessage('Gagal menghapus data.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SafeAreaView
        edges={['top']}
        style={[
          styles.container,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <View style={styles.wrapper}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Database
                size={25}
                color={theme.colors.primary}
              />
              <Text variant="headlineMedium">
                Data
              </Text>
            </View>

            <Button
              mode="contained"
              onPress={openAdd}
              icon={({ size, color }) => (
                <Plus size={size} color={color} />
              )}
            >
              Tambah
            </Button>
          </View>

          <Searchbar
            placeholder="Cari nama atau kode..."
            value={search}
            onChangeText={setSearch}
            icon={({ size, color }) => (
              <Search size={size} color={color} />
            )}
          />

          <View style={styles.statusRow}>
            <Text variant="bodySmall">
              {items.length} data ditampilkan
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.primary }}
            >
              SQLite Local
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
          >
            {loading ? (
              <ActivityIndicator style={styles.loader} />
            ) : items.length === 0 ? (
              <Card mode="outlined">
                <Card.Content>
                  <Text style={styles.empty}>
                    Belum ada data yang sesuai.
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              items.map((item) => (
                <Card key={item.id} mode="outlined">
                  <Card.Content style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text variant="titleMedium">
                        {item.name}
                      </Text>
                      <Text variant="bodySmall">
                        {item.sku}
                      </Text>
                    </View>

                    <IconButton
                      icon={({ size, color }) => (
                        <Pencil size={size} color={color} />
                      )}
                      onPress={() => openEdit(item)}
                      accessibilityLabel={`Edit ${item.name}`}
                    />

                    <IconButton
                      icon={({ size }) => (
                        <Trash2
                          size={size}
                          color={theme.colors.error}
                        />
                      )}
                      onPress={() => setDeleteTarget(item)}
                      accessibilityLabel={`Hapus ${item.name}`}
                    />
                  </Card.Content>
                </Card>
              ))
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

      <Portal>
        <Dialog
          visible={formVisible}
          onDismiss={closeForm}
        >
          <Dialog.Title>
            {editing ? 'Edit Barang' : 'Tambah Barang'}
          </Dialog.Title>

          <Dialog.Content style={styles.form}>
            <TextInput
              label="Nama Barang"
              mode="outlined"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError('');
              }}
              disabled={saving}
            />

            <TextInput
              label="Kode Barang"
              mode="outlined"
              value={sku}
              autoCapitalize="characters"
              onChangeText={(value) => {
                setSku(value);
                setError('');
              }}
              disabled={saving}
            />

            <HelperText
              type="error"
              visible={Boolean(error)}
            >
              {error}
            </HelperText>
          </Dialog.Content>

          <Dialog.Actions>
            <Button
              onPress={closeForm}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            >
              Simpan
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={deleteTarget !== null}
          onDismiss={() => {
            if (!saving) setDeleteTarget(null);
          }}
        >
          <Dialog.Title>
            Konfirmasi Hapus
          </Dialog.Title>

          <Dialog.Content>
            <Text>
              Yakin ingin menghapus data
              {' "'}{deleteTarget?.name}{'"'}?
            </Text>
          </Dialog.Content>

          <Dialog.Actions>
            <Button
              onPress={() => setDeleteTarget(null)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              onPress={handleDelete}
              loading={saving}
              disabled={saving}
              textColor={theme.colors.error}
            >
              Hapus
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Snackbar
          visible={Boolean(message)}
          onDismiss={() => setMessage('')}
          duration={3000}
        >
          {message}
        </Snackbar>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  loader: {
    marginTop: 30,
  },
  empty: {
    textAlign: 'center',
    padding: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  form: {
    gap: 12,
  },
});
