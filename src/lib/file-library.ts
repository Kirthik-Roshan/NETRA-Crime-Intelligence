import { libraryCall } from './ai-client';

export interface LibraryFile {
  id: string; kind: 'document' | 'report'; filename: string; title: string;
  mime: string; size: number; created_at: string; sha256: string;
  provider: 'filestore' | 'stratus'; extraction: string; text_characters: number;
  text_truncated: boolean; passage_count: number;
  photo_context?: { faces_count: number | null; synthetic: boolean; profile_id: number | null; link_method: string; notice: string };
}
export function listLibraryFiles(kind?: LibraryFile['kind']) {
  return libraryCall<{ rows: LibraryFile[] }>({ mode: 'files:list', kind });
}
export function libraryFileInfo(id: string) { return libraryCall<{ file: LibraryFile }>({ mode: 'files:info', id }); }
export async function uploadDocument(file: File, language: string, type: 'document' | 'photo' = 'document') {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a PDF or image up to 8 MB.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The selected file could not be read.')); reader.readAsDataURL(file);
  });
  return libraryCall<{ file: LibraryFile; warning?: string }>({ mode: type === 'photo' ? 'photo:upload' : 'document:upload', file: base64, name: file.name, language });
}
export async function fetchLibraryBlob(id: string) {
  const result = await libraryCall<{ file: LibraryFile; data: string }>({ mode: 'files:get', id });
  const raw = atob(result.data);
  return { file: result.file, blob: new Blob([Uint8Array.from(raw, value => value.charCodeAt(0))], { type: result.file.mime }) };
}
