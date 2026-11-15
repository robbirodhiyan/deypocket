
import { useState } from 'react';
import { Platform } from 'react-native';
import {
    Button,
    Card,
    Text,
} from 'react-native-paper';

import { exportDatabaseBackup } from '@/services/database-backup';
import { restoreDatabaseBackup } from '@/services/database-restore';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';

export default function DatabaseMaintenanceCard() {
    const db = useSQLiteContext();

    const [loading, setLoading] = useState(false);
    const [version, setVersion] = useState<number | null>(null);
    const [totalItems, setTotalItems] = useState<number | null>(null);
    const [integrity, setIntegrity] = useState<string>('');
    const [message, setMessage] = useState('');

    async function checkDatabase() {
        setLoading(true);
        setMessage('');

        try {
            const versionResult = await db.getFirstAsync<{
                user_version: number;
            }>('PRAGMA user_version');

            const itemsResult = await db.getFirstAsync<{
                total: number;
            }>('SELECT COUNT(*) AS total FROM items');

            const integrityResult = await db.getFirstAsync<{
                integrity_check: string;
            }>('PRAGMA integrity_check');

            setVersion(versionResult?.user_version ?? 0);
            setTotalItems(itemsResult?.total ?? 0);
            setIntegrity(integrityResult?.integrity_check ?? 'unknown');

            setMessage('Pemeriksaan database selesai.');
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Gagal memeriksa database.'
            );
        } finally {
            setLoading(false);
        }
    }

    function handleRestoreConfirmation() {
        if (loading) return;

        Alert.alert(
            'Restore Database',
            'Semua data database saat ini akan diganti dengan data dari file backup.\n\n' +
            'Pastikan kamu sudah menyimpan backup terbaru sebelum melanjutkan.',
            [
                {
                    text: 'Batal',
                    style: 'cancel',
                },
                {
                    text: 'Pilih File Backup',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        setMessage('');

                        try {
                            const restored = await restoreDatabaseBackup(db);

                            if (restored) {
                                setVersion(null);
                                setTotalItems(null);
                                setIntegrity('');

                                setMessage(
                                    'Restore berhasil. Tutup dan buka kembali aplikasi.'
                                );

                                Alert.alert(
                                    'Restore Berhasil',
                                    'Database berhasil dipulihkan. ' +
                                    'Tutup dan buka kembali aplikasi ' +
                                    'untuk memuat ulang seluruh data.'
                                );
                            }
                        } catch (error) {
                            const message =
                                error instanceof Error
                                    ? error.message
                                    : 'Restore database gagal.';

                            setMessage(message);

                            Alert.alert('Restore Gagal', message);
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    }

    async function handleBackup() {
        setLoading(true);
        setMessage('');

        try {
            await exportDatabaseBackup(db);
            setMessage('Proses berbagi file backup selesai.');
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Backup gagal.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card mode="outlined">
            <Card.Title
                title="Database Maintenance"
                subtitle="SQLite Offline Storage"
            />

            <Card.Content style={{ gap: 14 }}>
                <Text variant="bodyMedium">
                    Schema Version: {version ?? 'Belum diperiksa'}
                </Text>

                <Text variant="bodyMedium">
                    Total Items: {totalItems ?? 'Belum diperiksa'}
                </Text>

                <Text variant="bodyMedium">
                    Integrity: {integrity || 'Belum diperiksa'}
                </Text>

                <Button
                    mode="outlined"
                    onPress={checkDatabase}
                    disabled={loading}
                    loading={loading}
                >
                    Check Database
                </Button>

                {Platform.OS !== 'web' && (
                    <Button
                        mode="contained"
                        onPress={handleBackup}
                        disabled={loading}
                    >
                        Export Backup
                    </Button>
                )}
                {Platform.OS === 'android' && (
                    <Button
                        mode="outlined"
                        onPress={handleRestoreConfirmation}
                        disabled={loading}
                        icon="database-import"
                    >
                        Restore Backup
                    </Button>
                )}

                {Boolean(message) && (
                    <Text variant="bodySmall">{message}</Text>
                )}
            </Card.Content>
        </Card>
    );
}
