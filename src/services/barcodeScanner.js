import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';

export class BarcodeScannerError extends Error {
  constructor(message, code = 'UNKNOWN', cause = null) {
    super(message);
    this.name = 'BarcodeScannerError';
    this.code = code;
    this.cause = cause;
  }
}

export function canUseNativeBarcodeScanner() {
  return Capacitor.isNativePlatform();
}

function normalizeBarcodeValue(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim();
}

export async function scanNativeBarcode() {
  if (!canUseNativeBarcodeScanner()) {
    throw new BarcodeScannerError(
      'Native barcode scanning is unavailable on this platform.',
      'UNSUPPORTED'
    );
  }

  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
      scanInstructions: 'Align the barcode within the frame',
      scanButton: true,
      scanText: 'Scan Barcode',
      android: {
        scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT,
      },
      web: {
        showCameraSelection: false,
        scannerFPS: 20,
      },
    });

    const barcode = normalizeBarcodeValue(result?.ScanResult);
    if (!barcode) {
      throw new BarcodeScannerError(
        'No barcode was detected. Please try again.',
        'NO_RESULT'
      );
    }

    return {
      barcode,
      format: result?.format ?? null,
    };
  } catch (error) {
    if (error instanceof BarcodeScannerError) {
      throw error;
    }

    const message = String(error?.message ?? error ?? '').toLowerCase();
    if (message.includes('cancel')) {
      throw new BarcodeScannerError(
        'Barcode scan canceled.',
        'CANCELLED',
        error
      );
    }

    if (message.includes('permission')) {
      throw new BarcodeScannerError(
        'Camera permission is required to scan barcodes.',
        'PERMISSION_DENIED',
        error
      );
    }

    throw new BarcodeScannerError(
      'Unable to scan barcode right now. Please try manual entry.',
      'SCAN_FAILED',
      error
    );
  }
}
