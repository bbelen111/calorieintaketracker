import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const DEFAULT_EXIT_CONFIRM_WINDOW_MS = 2000;

export const useHardwareBackButton = ({
  currentScreen,
  homeIndex,
  goToScreen,
  closeTopmostModal,
  exitConfirmWindowMs = DEFAULT_EXIT_CONFIRM_WINDOW_MS,
}) => {
  const [showExitHint, setShowExitHint] = useState(false);
  const exitHintTimeoutRef = useRef(null);
  const lastBackPressAtRef = useRef(0);
  const currentScreenRef = useRef(currentScreen);
  const goToScreenRef = useRef(goToScreen);
  const closeTopmostModalRef = useRef(closeTopmostModal);

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  useEffect(() => {
    goToScreenRef.current = goToScreen;
  }, [goToScreen]);

  useEffect(() => {
    closeTopmostModalRef.current = closeTopmostModal;
  }, [closeTopmostModal]);

  const clearExitHintTimeout = useCallback(() => {
    if (exitHintTimeoutRef.current) {
      clearTimeout(exitHintTimeoutRef.current);
      exitHintTimeoutRef.current = null;
    }
  }, []);

  const resetExitHintState = useCallback(() => {
    lastBackPressAtRef.current = 0;
    setShowExitHint(false);
    clearExitHintTimeout();
  }, [clearExitHintTimeout]);

  const showExitHintMessage = useCallback(() => {
    setShowExitHint(true);
    clearExitHintTimeout();
    exitHintTimeoutRef.current = setTimeout(() => {
      setShowExitHint(false);
      exitHintTimeoutRef.current = null;
    }, exitConfirmWindowMs);
  }, [clearExitHintTimeout, exitConfirmWindowMs]);

  useEffect(() => {
    if (currentScreen !== homeIndex) {
      if (showExitHint) {
        // Defer setShowExitHint to avoid synchronous setState in effect
        setTimeout(() => setShowExitHint(false), 0);
      }
      lastBackPressAtRef.current = 0;
      clearExitHintTimeout();
    }
  }, [clearExitHintTimeout, currentScreen, homeIndex, showExitHint]);

  useEffect(
    () => () => {
      clearExitHintTimeout();
    },
    [clearExitHintTimeout]
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let listener = null;

    const setup = async () => {
      listener = await App.addListener('backButton', () => {
        const didCloseModal = closeTopmostModalRef.current?.() ?? false;
        if (didCloseModal) {
          return;
        }

        if (currentScreenRef.current !== homeIndex) {
          resetExitHintState();
          goToScreenRef.current?.(homeIndex);
          return;
        }

        const now = Date.now();
        const withinExitWindow =
          now - lastBackPressAtRef.current <= exitConfirmWindowMs;

        if (withinExitWindow) {
          resetExitHintState();
          App.exitApp();
          return;
        }

        lastBackPressAtRef.current = now;
        showExitHintMessage();
      });
    };

    setup();

    return () => {
      listener?.remove?.();
    };
  }, [exitConfirmWindowMs, homeIndex, resetExitHintState, showExitHintMessage]);

  return { showExitHint };
};
