import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { useEnergyMapStore } from '../store/useEnergyMapStore.js';
import {
  getHeartRateSensorState,
  subscribeHeartRateSensor,
} from '../services/heartRateSensor.js';
import {
  initializeNotifications,
  reconcileNotifications,
  registerNotificationTapHandler,
  syncLiveHeartRateGuard,
  syncRemotePushSubscription,
} from '../services/notifications.js';
import { isNotificationPlatform } from '../services/notificationBridge.js';

const RECONCILE_DEBOUNCE_MS = 600;

/**
 * Lifecycle driver for the Notification Subsystem (mounted ONCE in
 * `EnergyMapCalculator`, after store hydration).
 *
 * - Initializes channels, permission state, and tap/push listeners on load.
 * - Reconciles scheduled local notifications on debounced store updates
 *   (meals, weight, steps, phases, workouts, notification preferences) and
 *   on app foreground/background transitions.
 * - Syncs Layer 2 remote push registration whenever the announcements opt-in
 *   or master switch changes.
 * - Watches live BLE HR sensor state to arm/clear the recording guard (#12).
 *
 * @param {{ isLoaded: boolean, onAction?: (extra: object) => void }} params
 */
export const useNotifications = ({ isLoaded, onAction }) => {
  const onActionRef = useRef(onAction);
  const reconcileTimerRef = useRef(null);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!isLoaded) {
      return undefined;
    }

    const unregisterTap = registerNotificationTapHandler((extra) => {
      onActionRef.current?.(extra);
    });

    const scheduleReconcile = () => {
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
      }
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        const store = useEnergyMapStore.getState();
        if (!store.isLoaded) {
          return;
        }
        reconcileNotifications({
          userData: store.userData,
          derivedState: store,
        }).catch((error) =>
          console.warn('[Notifications] Reconcile failed:', error)
        );
      }, RECONCILE_DEBOUNCE_MS);
    };

    initializeNotifications()
      .then(() => {
        const store = useEnergyMapStore.getState();
        return Promise.all([
          reconcileNotifications({
            userData: store.userData,
            derivedState: store,
          }),
          syncRemotePushSubscription(store.userData?.notifications),
          syncLiveHeartRateGuard(getHeartRateSensorState().recording),
        ]);
      })
      .catch((error) =>
        console.warn('[Notifications] Startup sync failed:', error)
      );

    // Reconcile when relevant userData changes (debounced so rapid food/macro
    // edits coalesce into one OS scheduling diff).
    let lastRemoteKey = '';
    const getRemoteKey = (notifications) =>
      `${Boolean(notifications?.enabled)}:${Boolean(
        notifications?.remotePush?.announcementsEnabled
      )}`;
    lastRemoteKey = getRemoteKey(
      useEnergyMapStore.getState().userData?.notifications
    );

    const unsubscribeStore = useEnergyMapStore.subscribe(
      (state) => state.userData,
      (nextUserData) => {
        scheduleReconcile();
        const nextRemoteKey = getRemoteKey(nextUserData?.notifications);
        if (nextRemoteKey !== lastRemoteKey) {
          lastRemoteKey = nextRemoteKey;
          syncRemotePushSubscription(nextUserData?.notifications).catch(
            (error) =>
              console.warn('[Notifications] Remote push sync failed:', error)
          );
        }
        syncLiveHeartRateGuard(getHeartRateSensorState().recording).catch(
          () => {}
        );
      }
    );

    // Live BLE HR recording guard (#12).
    const unsubscribeSensor = subscribeHeartRateSensor(() => {
      syncLiveHeartRateGuard(getHeartRateSensorState().recording).catch(
        (error) =>
          console.warn('[Notifications] Live HR guard sync failed:', error)
      );
    });

    // Reconcile on foreground/background transitions (catches midnight rollover
    // and keeps pending notifications fresh before the app sleeps).
    let appStateHandle = null;
    let isCancelled = false;
    if (isNotificationPlatform()) {
      App.addListener('appStateChange', () => {
        const store = useEnergyMapStore.getState();
        if (!store.isLoaded) {
          return;
        }
        reconcileNotifications({
          userData: store.userData,
          derivedState: store,
        }).catch((error) =>
          console.warn('[Notifications] App-state reconcile failed:', error)
        );
      })
        .then((handle) => {
          if (isCancelled) {
            handle.remove();
          } else {
            appStateHandle = handle;
          }
        })
        .catch(() => {});
    }

    return () => {
      isCancelled = true;
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      unregisterTap();
      unsubscribeStore();
      unsubscribeSensor();
      appStateHandle?.remove?.();
    };
  }, [isLoaded]);
};
