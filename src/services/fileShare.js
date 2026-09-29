/**
 * File delivery (export) bridge — web download vs native share sheet.
 *
 * Why this module exists: every export flow in the app used to end in
 * `Blob` → `URL.createObjectURL` → `<a download>` → `link.click()`. That is a
 * SILENT NO-OP inside a native WebView: neither WKWebView (iOS) nor the Android
 * WebView implements the `download` attribute — there is no download manager and
 * the click never leaves the page. "Export CSV" therefore produced no file, no
 * error and no feedback on a phone.
 *
 * - WEB: keep the anchor download, which is exactly the right mechanism in a
 *   real browser.
 * - NATIVE: write the payload into the app's Cache directory and hand the file
 *   URI to the OS share sheet (Save to Files / AirDrop / Mail / Messages / …),
 *   the platform-sanctioned way to move a file out of a sandboxed app.
 *
 * The native plugin modules are imported DYNAMICALLY, so the web bundle never
 * ships native-only plugin code — the same hygiene the repo applies to
 * `foodCatalog` and `openrouter` in heavy UI flows.
 */
import { isNative } from '../utils/platform.js';

/**
 * The iOS Share plugin rejects with `"Share canceled"` when the user dismisses
 * the sheet (`SharePlugin.swift`). That is a normal outcome, not a failure, so
 * it must not surface as an export error.
 */
const SHARE_CANCEL_TEST = /cancel/i;

/**
 * Make a file name safe for the iOS sandbox, the Android filesystem and the web.
 * Export names are derived from user-entered phase names, so path separators and
 * reserved characters have to be neutralised before they reach a filesystem.
 */
export const sanitizeExportFileName = (fileName) => {
  const cleaned = String(fileName ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || `export-${Date.now()}.txt`;
};

const isShareDismissed = (error) =>
  SHARE_CANCEL_TEST.test(String(error?.message ?? error ?? ''));

const deliverOnWeb = ({ fileName, content, mimeType }) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Released on the next task: by then the click has queued the fetch, whereas
  // revoking inline can cancel the download in some engines.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return { success: true, method: 'download', fileName };
};

const deliverOnNative = async ({ fileName, content, title, dialogTitle }) => {
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  // Cache, not Documents: this file exists only to be handed to another app, so
  // it should not clutter the user's own Documents/Files listing (and the OS may
  // reclaim it once the share completes).
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title, dialogTitle, files: [uri] });
  } catch (error) {
    if (isShareDismissed(error)) {
      return { success: true, method: 'share', fileName, uri, canceled: true };
    }
    throw error;
  }

  return { success: true, method: 'share', fileName, uri, canceled: false };
};

/**
 * Hand a generated text payload to the user (web download or native share).
 *
 * Never throws: a failed export is reported in the resolved value so a caller
 * cannot miss it, and the console warning carries the detail. `mimeType` is used
 * on the web only — the native share sheet infers the type from the extension.
 *
 * @returns {Promise<{success: boolean, method: 'download'|'share'|'none',
 *   fileName: string, uri?: string, canceled?: boolean, error?: string}>}
 */
export const saveTextFile = async ({
  fileName,
  content,
  mimeType = 'text/plain;charset=utf-8;',
  title,
  dialogTitle,
} = {}) => {
  const safeName = sanitizeExportFileName(fileName);

  try {
    if (isNative()) {
      return await deliverOnNative({
        fileName: safeName,
        content,
        title,
        dialogTitle,
      });
    }

    return deliverOnWeb({ fileName: safeName, content, mimeType });
  } catch (error) {
    console.warn('Failed to export file:', error);
    return {
      success: false,
      method: 'none',
      fileName: safeName,
      error: error?.message ?? String(error),
    };
  }
};
