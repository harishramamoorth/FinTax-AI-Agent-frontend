import { describe, expect, it } from 'vitest';
import { processLocalDocument } from './processDocument';

describe('local document processing', () => {
  it('stops immediately when the upload has already been canceled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(processLocalDocument(
      new File([], 'canceled.png', { type: 'image/png' }),
      () => undefined,
      undefined,
      undefined,
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });
  });
});
