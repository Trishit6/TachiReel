import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function fileExtension(asset: ImagePickerAsset): string {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const fromMime = asset.mimeType ? MIME_EXTENSIONS[asset.mimeType] : undefined;
  if (fromMime) return fromMime;
  return asset.type === 'video' ? 'mp4' : 'jpg';
}

export function validateAsset(asset: ImagePickerAsset): string | null {
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) return 'That file is larger than 50 MB. Choose a smaller one.';
  const type = asset.mimeType ?? '';
  const allowed = type.startsWith('image/') || type.startsWith('video/');
  if (type && !allowed) return 'Choose a photo or video file.';
  return null;
}

export async function readAssetBody(asset: ImagePickerAsset): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file;
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('Could not read the selected file.');
    return await response.blob();
  }
  // Supabase Storage needs an ArrayBuffer on React Native; File/Blob/FormData do not upload correctly.
  const { File } = await import('expo-file-system');
  return await new File(asset.uri).arrayBuffer();
}

export async function uploadAsset(
  client: SupabaseClient,
  userId: string,
  asset: ImagePickerAsset,
  bucket = 'post-media',
): Promise<{ path: string; contentType: string }> {
  const rawType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const contentType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${fileExtension(asset)}`;
  const { error } = await client.storage.from(bucket).upload(path, await readAssetBody(asset), {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return { path, contentType };
}
