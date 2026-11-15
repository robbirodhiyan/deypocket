import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytesAsync } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/** Sprint 4D: Encrypted, portable, password-derived backups. */
const FORMAT = 'deypocket.encrypted-backup';
const VERSION = 1;
const KDF = 'scrypt';
const KDF_N = 1 << 15;
const KDF_R = 8;
const KDF_P = 1;
const MAX_ENCRYPTED_BYTES = 30 * 1024 * 1024;
const MAX_PLAIN_BYTES = 20 * 1024 * 1024;

type EncryptedEnvelope = {
  format: typeof FORMAT;
  version: typeof VERSION;
  kdf: typeof KDF;
  n: typeof KDF_N;
  r: typeof KDF_R;
  p: typeof KDF_P;
  saltHex: string;
  payloadBase64: string;
};

export type SelectedBackupFile = {
  name: string;
  content: string;
  encrypted: boolean;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

export function isEncryptedBackupName(name: string): boolean {
  return name.toLowerCase().endsWith('.dpk');
}

export function ensureBackupPassword(password: string): void {
  if (Array.from(password).length < 12 || Array.from(password).length > 256) {
    throw new Error('Password backup harus terdiri dari 12–256 karakter.');
  }
}

function readEnvelope(content: string): EncryptedEnvelope {
  if (content.length < 50 || content.length > MAX_ENCRYPTED_BYTES) {
    throw new Error('Ukuran file backup terenkripsi tidak valid (maksimum 30 MB).');
  }
  let object: unknown;
  try { object = JSON.parse(content) as unknown; }
  catch { throw new Error('Format backup terenkripsi tidak valid.'); }
  if (!isRecord(object) || Object.keys(object).length !== 8 ||
      object.format !== FORMAT || object.version !== VERSION || object.kdf !== KDF ||
      object.n !== KDF_N || object.r !== KDF_R || object.p !== KDF_P ||
      typeof object.saltHex !== 'string' || !/^[a-f0-9]{32}$/.test(object.saltHex) ||
      typeof object.payloadBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(object.payloadBase64) ||
      object.payloadBase64.length < 40 || object.payloadBase64.length > MAX_ENCRYPTED_BYTES) {
    throw new Error('Format atau parameter keamanan backup tidak dikenali.');
  }
  return object as EncryptedEnvelope;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = utf8ToBytes(password);
  try {
    return await scryptAsync(passwordBytes, salt, {
      N: KDF_N, r: KDF_R, p: KDF_P, dkLen: 32, maxmem: 64 * 1024 * 1024,
    });
  } finally {
    passwordBytes.fill(0);
  }
}

/** Input is the validated JSON produced by createBackup() from Sprint 4C. */
export async function encryptBackupJson(plainJson: string, password: string): Promise<string> {
  ensureBackupPassword(password);
  if (!plainJson || plainJson.length > MAX_PLAIN_BYTES) {
    throw new Error('Ukuran backup melebihi batas 20 MB.');
  }
  const bytes = utf8ToBytes(plainJson);
  if (bytes.byteLength > MAX_PLAIN_BYTES) throw new Error('Backup UTF-8 melebihi 20 MB.');
  const salt = await getRandomBytesAsync(16);
  const keyBytes = await deriveKey(password, salt);
  try {
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = await aesEncryptAsync(bytes, key);
    const combined = await sealed.combined('base64');
    if (typeof combined !== 'string') throw new Error('Hasil enkripsi bukan Base64.');
    const envelope: EncryptedEnvelope = {
      format: FORMAT, version: VERSION, kdf: KDF,
      n: KDF_N, r: KDF_R, p: KDF_P,
      saltHex: bytesToHex(salt), payloadBase64: combined,
    };
    const encoded = JSON.stringify(envelope);
    if (encoded.length > MAX_ENCRYPTED_BYTES) throw new Error('File terenkripsi melebihi 30 MB.');
    return encoded;
  } finally {
    keyBytes.fill(0);
  }
}

/** Authenticated AES-GCM decryption; wrong passwords and tampered files are rejected. */
export async function decryptBackupJson(encryptedContent: string, password: string): Promise<string> {
  const envelope = readEnvelope(encryptedContent);
  if (!password) throw new Error('Masukkan password untuk membuka backup.');
  const keyBytes = await deriveKey(password, hexToBytes(envelope.saltHex));
  try {
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = AESSealedData.fromCombined(envelope.payloadBase64);
    let plain: string | Uint8Array;
    try {
      plain = await aesDecryptAsync(sealed, key, { output: 'bytes' });
    } catch {
      throw new Error('Password salah atau file backup telah berubah/rusak.');
    }
    if (typeof plain === 'string') throw new Error('Hasil dekripsi tidak didukung.');
    if (plain.byteLength === 0 || plain.byteLength > MAX_PLAIN_BYTES) {
      throw new Error('Isi backup melebihi batas yang didukung.');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(plain);
    } catch {
      throw new Error('Isi backup tidak memiliki encoding UTF-8 yang valid.');
    }
  } finally {
    keyBytes.fill(0);
  }
}

export async function pickProtectedBackupFile(): Promise<SelectedBackupFile | null> {
  const chosen = await DocumentPicker.getDocumentAsync({
    type: '*/*', multiple: false, copyToCacheDirectory: true, base64: false,
  });
  if (chosen.canceled) return null;
  const asset = chosen.assets[0];
  if (!asset || !/\.(dpk|json)$/i.test(asset.name)) {
    throw new Error('Pilih file DeyPocket dengan ekstensi .dpk atau .json.');
  }
  const limit = isEncryptedBackupName(asset.name) ? MAX_ENCRYPTED_BYTES : MAX_PLAIN_BYTES;
  if (asset.size !== undefined && (asset.size === 0 || asset.size > limit)) {
    throw new Error('Ukuran file backup tidak didukung.');
  }
  const content = Platform.OS === 'web'
    ? (chosen.output?.item(0) ? await chosen.output.item(0)!.text() : await (await fetch(asset.uri)).text())
    : await new File(asset.uri).text();
  if (!content || content.length > limit) throw new Error('File backup kosong atau terlalu besar.');
  if (isEncryptedBackupName(asset.name)) readEnvelope(content);
  return { name: asset.name, content, encrypted: isEncryptedBackupName(asset.name) };
}

export function encryptedFileName(date = new Date()): string {
  return `DeyPocket-secure-${date.toISOString().replace(/[:.]/g, '-').slice(0, 23)}.dpk`;
}
