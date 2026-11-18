import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { formatStorageExplanation } from '../features/deypocket/release-privacy';

export default function PrivacyInformationScreen() {
  return (
    <ScrollView contentContainerStyle={{padding:18,gap:14,paddingBottom:60,maxWidth:720,alignSelf:'center',width:'100%'}}>
      <Stack.Screen options={{title:'Privasi & Penyimpanan'}}/>
      <Text variant="headlineSmall" style={{fontWeight:'800'}}>Privasi & Penyimpanan</Text>
      <Card mode="outlined"><Card.Content style={{gap:8}}>
        <Text variant="titleMedium">Data disimpan secara lokal</Text>
        <Text>{formatStorageExplanation()}</Text>
      </Card.Content></Card>
      <Card mode="outlined"><Card.Content style={{gap:8}}>
        <Text variant="titleMedium">Backup bersifat pribadi</Text>
        <Text>Backup SQLite yang diekspor masih berupa file mentah dan belum menggunakan enkripsi kata sandi. Hindari lokasi publik.</Text>
      </Card.Content></Card>
      <Card mode="outlined"><Card.Content style={{gap:8}}>
        <Text variant="titleMedium">Hapus aplikasi</Text>
        <Text>Menghapus aplikasi dapat menghapus database lokal. Pastikan backup tersimpan secara terpisah sebelum uninstall atau ganti perangkat.</Text>
      </Card.Content></Card>
    </ScrollView>
  );
}
