import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import {
  selectAndInspectBackup, shareDatabaseBackup,
  type BackupInspection,
} from '../features/deypocket/database-backup';

export default function BackupReviewScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BackupInspection|null>(null);
  const [message,setMessage] = useState('');
  const perform = async (fn:()=>Promise<BackupInspection|null>, success:string) => {
    if(busy) return;
    setBusy(true);setReport(null);setMessage('');
    try {const result=await fn(); if(result){setReport(result);setMessage(success);}}
    catch(e){setMessage(e instanceof Error?e.message:'Proses backup gagal.');}
    finally {setBusy(false);}
  };
  return (
    <ScrollView contentContainerStyle={{padding:18,gap:16,paddingBottom:60,maxWidth:720,alignSelf:'center',width:'100%'}}>
      <Stack.Screen options={{title:'Backup Data'}}/>
      <Text variant="headlineSmall" style={{fontWeight:'800'}}>Backup Data</Text>
      <Text style={{color:theme.colors.onSurfaceVariant}}>
        Simpan salinan SQLite ke lokasi pribadi. File backup belum dienkripsi;
        jangan bagikan kepada orang lain.
      </Text>
      <Card mode="outlined"><Card.Content style={{gap:12}}>
        <Text variant="titleMedium">Ekspor database</Text>
        <Text variant="bodySmall">Memeriksa integritas sebelum file dibagikan.</Text>
        <Button mode="contained" disabled={busy} loading={busy} onPress={()=>void perform(()=>shareDatabaseBackup(db),'File backup telah disiapkan. Pastikan tersimpan di lokasi pilihanmu.')}>Ekspor Backup</Button>
      </Card.Content></Card>
      <Card mode="outlined"><Card.Content style={{gap:12}}>
        <Text variant="titleMedium">Periksa file backup</Text>
        <Text variant="bodySmall">Memeriksa file SQLite di memori sementara. Data aktif tidak berubah.</Text>
        <Button mode="outlined" disabled={busy} onPress={()=>void perform(selectAndInspectBackup,'File backup lolos pemeriksaan integritas.')}>Pilih & Periksa File</Button>
      </Card.Content></Card>
      {Boolean(message) && <Card mode="outlined"><Card.Content><Text>{message}</Text></Card.Content></Card>}
      {report && <Card mode="outlined"><Card.Content style={{gap:6}}>
        <Text variant="titleSmall">Hasil Pemeriksaan</Text>
        <Text>{report.tables} tabel · {report.bytes.toLocaleString('id-ID')} byte · SQLite {report.integrity}</Text>
      </Card.Content></Card>}
      <View style={{padding:12,backgroundColor:theme.colors.errorContainer,borderRadius:12}}>
        <Text style={{color:theme.colors.onErrorContainer}}>
          Restore ke database aktif belum diaktifkan. Alur pemulihan memerlukan
          pengujian khusus agar transaksi dan SQLite Provider yang terbuka tidak rusak.
        </Text>
      </View>
    </ScrollView>
  );
}
