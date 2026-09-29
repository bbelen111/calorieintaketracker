import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CapacitorMock,
  FilesystemMock,
  ShareMock,
} from '../tests/mocks/capacitor.js';
import { sanitizeExportFileName, saveTextFile } from './fileShare.js';

/**
 * Export delivery contract.
 *
 * The bug this pins: the anchor-download path is a SILENT NO-OP in a native
 * WebView, so on a phone "Export CSV" produced nothing at all. These tests
 * assert the two paths are mutually exclusive — the browser must never touch the
 * filesystem/share plugins, and the native shell must never rely on an anchor
 * download.
 */
const setPlatform = (platform) => {
  CapacitorMock.isNativePlatform.mockReturnValue(platform !== 'web');
  CapacitorMock.getPlatform.mockReturnValue(platform);
};

describe('saveTextFile', () => {
  let clickSpy;
  let createObjectURLSpy;
  let revokeObjectURLSpy;

  beforeEach(() => {
    clickSpy = vi
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;
  });

  describe('web', () => {
    beforeEach(() => {
      setPlatform('web');
    });

    it('downloads through an anchor and reports the method', async () => {
      const result = await saveTextFile({
        fileName: 'report.csv',
        content: 'a,b',
        mimeType: 'text/csv;charset=utf-8;',
      });

      expect(result).toEqual({
        success: true,
        method: 'download',
        fileName: 'report.csv',
      });

      const anchor = clickSpy.mock.instances[0];
      expect(anchor.getAttribute('download')).toBe('report.csv');
      expect(anchor.getAttribute('href')).toBe('blob:mock-url');
      // The temporary anchor must not be left in the document.
      expect(document.body.querySelector('a')).toBeNull();
    });

    it('never touches the filesystem or share plugins', async () => {
      await saveTextFile({ fileName: 'report.csv', content: 'a,b' });

      expect(FilesystemMock.writeFile).not.toHaveBeenCalled();
      expect(ShareMock.share).not.toHaveBeenCalled();
    });

    it('releases the object URL once the download is queued', async () => {
      vi.useFakeTimers();
      try {
        await saveTextFile({ fileName: 'report.csv', content: 'a,b' });

        // Not revoked inline: that can cancel the download in some engines.
        expect(revokeObjectURLSpy).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('native', () => {
    it('writes to the cache directory and opens the share sheet', async () => {
      setPlatform('ios');

      const result = await saveTextFile({
        fileName: 'report.csv',
        content: 'a,b',
        title: 'Export Bulking',
        dialogTitle: 'Export phase data',
      });

      expect(FilesystemMock.writeFile).toHaveBeenCalledWith({
        path: 'report.csv',
        data: 'a,b',
        directory: 'CACHE',
        encoding: 'utf8',
      });
      expect(ShareMock.share).toHaveBeenCalledWith({
        title: 'Export Bulking',
        dialogTitle: 'Export phase data',
        files: ['file:///mock-cache/report.csv'],
      });
      expect(result).toEqual({
        success: true,
        method: 'share',
        fileName: 'report.csv',
        uri: 'file:///mock-cache/report.csv',
        canceled: false,
      });

      // The anchor path is a silent no-op in a WebView — it must not run here.
      expect(clickSpy).not.toHaveBeenCalled();
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it('runs the same native path on Android', async () => {
      setPlatform('android');

      const result = await saveTextFile({
        fileName: 'report.json',
        content: '{}',
      });

      expect(FilesystemMock.writeFile).toHaveBeenCalledTimes(1);
      expect(ShareMock.share).toHaveBeenCalledTimes(1);
      expect(result.method).toBe('share');
    });

    it('treats a dismissed share sheet as a normal outcome', async () => {
      setPlatform('ios');
      // What `SharePlugin.swift` rejects with when the user dismisses the sheet.
      ShareMock.share.mockRejectedValueOnce(new Error('Share canceled'));

      const result = await saveTextFile({
        fileName: 'report.csv',
        content: 'a',
      });

      expect(result.success).toBe(true);
      expect(result.canceled).toBe(true);
    });

    it('reports a real share failure without throwing', async () => {
      setPlatform('ios');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ShareMock.share.mockRejectedValueOnce(new Error('No activity view'));

      const result = await saveTextFile({
        fileName: 'report.csv',
        content: 'a',
      });

      expect(result.success).toBe(false);
      expect(result.method).toBe('none');
      expect(result.error).toBe('No activity view');
      expect(warn).toHaveBeenCalledWith(
        'Failed to export file:',
        expect.any(Error)
      );
    });

    it('reports a filesystem failure without throwing', async () => {
      setPlatform('ios');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      FilesystemMock.writeFile.mockRejectedValueOnce(new Error('disk full'));

      const result = await saveTextFile({
        fileName: 'report.csv',
        content: 'a',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('disk full');
      // Nothing to share if the file was never written.
      expect(ShareMock.share).not.toHaveBeenCalled();
    });

    it('sanitizes the name before it reaches a filesystem', async () => {
      setPlatform('ios');

      await saveTextFile({ fileName: '../etc/passwd', content: 'x' });

      expect(FilesystemMock.writeFile.mock.calls[0][0].path).toBe(
        '_etc_passwd'
      );
    });
  });
});

describe('sanitizeExportFileName', () => {
  it('neutralises path separators and reserved characters', () => {
    expect(sanitizeExportFileName('a/b\\c:d*e?f"g<h>i|j.csv')).toBe(
      'a_b_c_d_e_f_g_h_i_j.csv'
    );
  });

  it('strips leading dots so a name cannot become a hidden or relative path', () => {
    expect(sanitizeExportFileName('...hidden.csv')).toBe('hidden.csv');
  });

  it('falls back when there is nothing usable left', () => {
    expect(sanitizeExportFileName('   ')).toMatch(/^export-\d+\.txt$/);
    expect(sanitizeExportFileName(undefined)).toMatch(/^export-\d+\.txt$/);
  });

  it('leaves an already-safe export name untouched', () => {
    expect(sanitizeExportFileName('Bulking_Phase_2026-09-29.csv')).toBe(
      'Bulking_Phase_2026-09-29.csv'
    );
  });
});
