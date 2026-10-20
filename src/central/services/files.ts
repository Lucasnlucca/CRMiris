import type { Attachment } from '../types';
import { newId } from '../utils/format';

const files = new Map<string, File>();
const urls = new Map<string, string>();

export const fileStore = {
  add(file: File, id = newId('file')): Attachment {
    const existingUrl = urls.get(id);
    if (existingUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(existingUrl);
    urls.delete(id);
    files.set(id, file);
    return { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  },
  get(id: string): File | undefined {
    return files.get(id);
  },
  url(id: string): string | undefined {
    const file = files.get(id);
    if (!file || typeof URL.createObjectURL !== 'function') return undefined;
    if (!urls.has(id)) urls.set(id, URL.createObjectURL(file));
    return urls.get(id);
  },
  clear(): void {
    if (typeof URL.revokeObjectURL === 'function')
      for (const url of urls.values()) URL.revokeObjectURL(url);
    files.clear();
    urls.clear();
  },
};
