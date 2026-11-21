import React, { useEffect } from 'react';
import {
  Bluetooth,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Signal,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  connectSensor,
  disconnectSensor,
  startSensorScan,
  stopSensorScan,
  useHeartRateSensorState,
} from '../../../../services/heartRateSensor';

/**
 * Scan for Bluetooth heart-rate sensors (standard Heart Rate Service 0x180D:
 * chest straps, arm bands, watches in HR-broadcast mode) and pair one. The
 * paired device is remembered in `userData.heartRateSensor` by the
 * orchestrator (`onPaired` / `onForget`).
 */
export const HeartRateSensorPairingModal = ({
  isOpen,
  isClosing,
  pairedSensor,
  onPaired,
  onForget,
  onClose,
}) => {
  const sensor = useHeartRateSensorState();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    startSensorScan();
    return () => {
      stopSensorScan();
    };
  }, [isOpen]);

  const handlePick = async (device) => {
    const connected = await connectSensor(device);
    if (connected) {
      onPaired?.({ deviceId: device.deviceId, name: device.name });
    }
  };

  const isScanning = sensor.connection === 'scanning';
  const results = [...sensor.scanResults].sort(
    (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)
  );

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-foreground font-bold text-xl">Heart-rate sensor</h3>
        <button
          type="button"
          onClick={() => startSensorScan()}
          disabled={isScanning}
          aria-label="Scan again"
          className="p-2 rounded-md text-muted md:hover:text-foreground focus-ring pressable-inline disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
        </button>
      </div>
      <p className="text-muted text-sm mb-4">
        Wake your strap (wet the electrodes and put it on) or turn on heart-rate
        broadcast on your watch.
      </p>

      {pairedSensor && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/50 p-3">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 size={16} className="text-accent-green" />
            {pairedSensor.name}
          </span>
          <button
            type="button"
            onClick={async () => {
              await disconnectSensor();
              onForget?.();
            }}
            className="text-xs font-medium text-accent-red focus-ring rounded px-2 py-1 pressable-inline"
          >
            Forget
          </button>
        </div>
      )}

      {results.length > 0 ? (
        <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
          {results.map((device) => {
            const isCurrent =
              sensor.deviceId === device.deviceId &&
              (sensor.connection === 'connecting' ||
                sensor.connection === 'connected');
            return (
              <li key={device.deviceId}>
                <button
                  type="button"
                  onClick={() => handlePick(device)}
                  disabled={sensor.connection === 'connecting'}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/50 p-3 text-left pressable-card focus-ring disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Bluetooth size={16} className="text-accent-blue" />
                    {device.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {isCurrent && sensor.connection === 'connecting' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      device.rssi != null && (
                        <>
                          <Signal size={14} /> {device.rssi} dBm
                        </>
                      )
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted">
          {isScanning
            ? 'Looking for sensors…'
            : 'No sensors found. Tap refresh to scan again.'}
        </p>
      )}

      {sensor.error && (
        <p className="mt-3 text-sm text-accent-orange">{sensor.error}</p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full bg-surface-highlight text-foreground px-6 py-3 rounded-lg font-medium focus-ring press-feedback"
      >
        Done
      </button>
    </ModalShell>
  );
};
