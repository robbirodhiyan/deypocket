
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Card, Text } from 'react-native-paper';

type DatabaseStatus = {
  ready: boolean;
  version: number;
  total: number;
  error?: string;
};

export default function DatabaseStatusCard() {
  const db = useSQLiteContext();

  const [status, setStatus] = useState<DatabaseStatus | null>(null);

  useEffect(() => {
    let active = true;

    async function checkDatabase() {
      try {
        const version = await db.getFirstAsync<{
          user_version: number;
        }>('PRAGMA user_version');

        const table = await db.getFirstAsync<{
          name: string;
        }>(
          `SELECT name
           FROM sqlite_master
           WHERE type = 'table'
             AND name = 'items'`
        );

        if (!table) {
          throw new Error('Tabel items belum dibuat');
        }

        const result = await db.getFirstAsync<{
          total: number;
        }>('SELECT COUNT(*) AS total FROM items');

        if (active) {
          setStatus({
            ready: true,
            version: version?.user_version ?? 0,
            total: result?.total ?? 0,
          });
        }
      } catch (error) {
        if (active) {
          setStatus({
            ready: false,
            version: 0,
            total: 0,
            error:
              error instanceof Error
                ? error.message
                : 'Database error',
          });
        }
      }
    }

    checkDatabase();

    return () => {
      active = false;
    };
  }, [db]);

  return (
    <Card mode="outlined">
      <Card.Title title="SQLite Database Status" />

      <Card.Content>
        {!status ? (
          <ActivityIndicator />
        ) : status.ready ? (
          <>
            <Text>Database: appbuilder.db</Text>
            <Text>Connection: READY</Text>
            <Text>Schema Version: {status.version}</Text>
            <Text>Table: items</Text>
            <Text>Jumlah Data: {status.total}</Text>
          </>
        ) : (
          <>
            <Text>Connection: ERROR</Text>
            <Text>{status.error}</Text>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
