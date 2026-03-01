import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import App from './App.jsx';
import './index.css';

if (typeof document !== 'undefined') {
  const preventGesture = (event) => event.preventDefault();

  document.addEventListener('gesturestart', preventGesture);
  document.addEventListener('gesturechange', preventGesture);
  document.addEventListener('gestureend', preventGesture);

  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

if (Capacitor.isNativePlatform()) {
  Keyboard.setResizeMode({ mode: 'none' }).catch(() => null);
  Keyboard.setScroll({ isDisabled: true }).catch(() => null);

  // Suppress the broken native context menu (white panel with logo)
  // on Android WebView. Users can still use keyboard shortcuts.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
