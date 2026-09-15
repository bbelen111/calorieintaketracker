import { beforeEach, describe, expect, it } from 'vitest';

import {
  BarcodeScannerError,
  canUseNativeBarcodeScanner,
  scanNativeBarcode,
} from './barcodeScanner';
import { BarcodeScannerMock, CapacitorMock } from '../tests/mocks/capacitor.js';

const scanBarcode = BarcodeScannerMock.CapacitorBarcodeScanner.scanBarcode;

/**
 * The native barcode bridge. It is the only path that turns a plugin result into
 * an app-usable barcode, so the contract is: platform gating, digit normalisation,
 * and every plugin failure mapped onto a stable, user-presentable error code.
 */
describe('barcodeScanner', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    scanBarcode.mockReset();
  });

  describe('platform gating', () => {
    it('reports availability from the Capacitor platform', () => {
      expect(canUseNativeBarcodeScanner()).toBe(true);

      CapacitorMock.isNativePlatform.mockReturnValue(false);
      expect(canUseNativeBarcodeScanner()).toBe(false);
    });

    it('refuses to scan off-platform with an UNSUPPORTED error', async () => {
      CapacitorMock.isNativePlatform.mockReturnValue(false);

      await expect(scanNativeBarcode()).rejects.toMatchObject({
        name: 'BarcodeScannerError',
        code: 'UNSUPPORTED',
      });

      // The plugin must not be invoked at all on web.
      expect(scanBarcode).not.toHaveBeenCalled();
    });
  });

  describe('successful scans', () => {
    it('returns the normalised barcode and format', async () => {
      scanBarcode.mockResolvedValue({
        ScanResult: '0123456789012',
        format: 'EAN_13',
      });

      await expect(scanNativeBarcode()).resolves.toEqual({
        barcode: '0123456789012',
        format: 'EAN_13',
      });
    });

    it('strips non-digits and surrounding whitespace', async () => {
      scanBarcode.mockResolvedValue({ ScanResult: ' 012 345-6789 \n' });

      const { barcode } = await scanNativeBarcode();
      expect(barcode).toBe('0123456789');
    });

    it('reports a null format when the plugin omits it', async () => {
      scanBarcode.mockResolvedValue({ ScanResult: '4006381333931' });

      await expect(scanNativeBarcode()).resolves.toEqual({
        barcode: '4006381333931',
        format: null,
      });
    });

    it('requests the expected scanner configuration', async () => {
      scanBarcode.mockResolvedValue({ ScanResult: '123' });

      await scanNativeBarcode();

      expect(scanBarcode).toHaveBeenCalledTimes(1);
      const options = scanBarcode.mock.calls[0][0];
      expect(options).toMatchObject({
        hint: BarcodeScannerMock.CapacitorBarcodeScannerTypeHint.ALL,
        cameraDirection:
          BarcodeScannerMock.CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation:
          BarcodeScannerMock.CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        scanButton: true,
        android: {
          scanningLibrary:
            BarcodeScannerMock.CapacitorBarcodeScannerAndroidScanningLibrary
              .MLKIT,
        },
      });
      expect(options.web).toEqual({
        showCameraSelection: false,
        scannerFPS: 20,
      });
    });
  });

  describe('failure mapping', () => {
    const expectCode = async (pluginError, code) => {
      scanBarcode.mockReset();
      scanBarcode.mockRejectedValue(pluginError);

      const error = await scanNativeBarcode().catch((err) => err);
      expect(error).toBeInstanceOf(BarcodeScannerError);
      expect(error.code).toBe(code);
      return error;
    };

    it('maps an empty result to NO_RESULT', async () => {
      // An empty scan *resolves* — it is not a plugin failure.
      for (const pluginResult of [
        { ScanResult: '' },
        { ScanResult: '   ' },
        {},
      ]) {
        scanBarcode.mockReset();
        scanBarcode.mockResolvedValue(pluginResult);

        const error = await scanNativeBarcode().catch((err) => err);

        expect(error).toBeInstanceOf(BarcodeScannerError);
        expect(error.code).toBe('NO_RESULT');
      }
    });

    it('maps cancellation to CANCELLED and keeps the cause', async () => {
      const cause = new Error('User cancelled the scan');
      const error = await expectCode(cause, 'CANCELLED');

      expect(error.cause).toBe(cause);
    });

    it('maps permission failures to PERMISSION_DENIED', async () => {
      const cause = new Error('Camera permission not granted');
      const error = await expectCode(cause, 'PERMISSION_DENIED');

      expect(error.cause).toBe(cause);
    });

    it('maps anything else to SCAN_FAILED', async () => {
      await expectCode(new Error('Camera busy'), 'SCAN_FAILED');
    });

    it('passes through an already-mapped error untouched', async () => {
      const original = new BarcodeScannerError('No barcode.', 'NO_RESULT');
      scanBarcode.mockRejectedValue(original);

      await expect(scanNativeBarcode()).rejects.toBe(original);
    });

    it('exposes a usable error shape', () => {
      const error = new BarcodeScannerError(
        'Camera required.',
        'PERMISSION_DENIED'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BarcodeScannerError');
      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.cause).toBeNull();
    });
  });
});
