import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { saveBackupFile } from './backup-service';

/** Local encrypted copies; wiped when the app is uninstalled. */
const VAULT_FOLDER = 'deypocket-encrypted-backups';
const MAX_VAULT_FILES = 10;
const MAX_SIZE = 30 * 1024 * 1024;

export type VaultBackup = { name: string; size: number; modifiedAt: number | null };

function vaultDirectory(): Directory { return new Directory(Paths.document, VAULT_FOLDER); }

function ensureNative(): void {
  if (Platform.OS === 'web') throw new Error('Arsip lokal tersedia pada aplikasi Android/iOS.');
}

function checkFileName(name: string): void {
  if (!/^DeyPocket-secure-[0-9TZ-]+\.dpk$/.test(name) || name.length > 100) {
    throw new Error('Nama file backup tidak aman.');
  }
}

export async function storeEncryptedBackup(name: string, content: string): Promise<void> {
  ensureNative();
  checkFileName(name);
  if (!content || content.length > MAX_SIZE) throw new Error('File backup terlalu besar.');
  const directory = vaultDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, name);
  file.create({ overwrite: false });
  try { await file.write(content); }
  catch (error) { if (file.exists) file.delete(); throw error; }
  const files = await listEncryptedBackups();
  // Keep a bounded vault. Delete oldest copies only after latest was saved.
  for (const old of files.slice(MAX_VAULT_FILES)) {
    await removeEncryptedBackup(old.name);
  }
}

export async function listEncryptedBackups(): Promise<VaultBackup[]> {
  ensureNative();
  const directory = vaultDirectory();
  if (!directory.exists) return [];
  return directory.list()
    .filter((node): node is File => node instanceof File && /^DeyPocket-secure-[0-9TZ-]+\.dpk$/.test(node.name))
    .map((file) => ({ name: file.name, size: file.size ?? 0, modifiedAt: file.modificationTime ?? null }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function readEncryptedBackup(name: string): Promise<string> {
  ensureNative();
  checkFileName(name);
  const file = new File(vaultDirectory(), name);
  if (!file.exists || (file.size ?? MAX_SIZE + 1) > MAX_SIZE) throw new Error('Backup lokal tidak ditemukan atau terlalu besar.');
  return file.text();
}

export async function shareEncryptedBackup(name: string): Promise<void> {
  const content = await readEncryptedBackup(name);
  await saveBackupFile(name, content);
}

export async function removeEncryptedBackup(name: string): Promise<void> {
  ensureNative();
  checkFileName(name);
  const file = new File(vaultDirectory(), name);
  if (file.exists) file.delete();
}
