import {
  categoryForFilename,
  CLIENT_MAX_UPLOAD_BYTES,
  validateDemoFile,
  type DemoCategory,
} from '../shared/demoWorkflow';
import type { ClientArea } from './clientUi';

export interface UploadTypeChoice {
  id: string;
  category: DemoCategory;
}

export interface QueuedClientUpload {
  id: string;
  file: File;
  category: DemoCategory;
  area: ClientArea;
  typeId: string;
}

export interface ClientUploadQueueResult {
  queued: QueuedClientUpload[];
  rejected: string[];
}

export function createClientUploadQueue(
  files: File[],
  area: ClientArea,
  selectedTypes: UploadTypeChoice[],
  createId: () => string = () => crypto.randomUUID(),
): ClientUploadQueueResult {
  const queued: QueuedClientUpload[] = [];
  const rejected: string[] = [];
  const fallbackType = selectedTypes[0];

  for (const file of files) {
    const issue = validateDemoFile(file, CLIENT_MAX_UPLOAD_BYTES);
    if (issue) {
      rejected.push(`${file.name}: ${issue}`);
      continue;
    }

    const detectedCategory = categoryForFilename(file.name);
    const selectedType = selectedTypes.find((type) => type.category === detectedCategory) ?? fallbackType;
    if (!selectedType) {
      rejected.push(`${file.name}: Choose a document type before adding files.`);
      continue;
    }

    queued.push({
      id: createId(),
      file,
      category: selectedType.category,
      area,
      typeId: selectedType.id,
    });
  }

  return { queued, rejected };
}
