import React from 'react';
import ReactDOM from 'react-dom/client';
import { Keyboard } from '@capacitor/keyboard';
import App from './App.jsx';
import { isAndroid, isIOS } from './utils/platform.js';
import './index.css';

if (typeof document !== 'undefined') {
  const preventGesture = (event) => event.preventDefault();

  // `gesture*` is a WebKit-only event set, so this is the iOS/WKWebView
  // pinch-to-zoom guard. Everywhere else the CSS `touch-action: pan-x pan-y`
  // declaration is what suppresses the gesture (the listeners stay registered
  // for all platforms because they are inert outside WebKit).
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

// Both calls below are iOS-ONLY APIs (`@capacitor/keyboard` documents
// setResizeMode/setScroll as "only supported on iOS", and setAccessoryBarVisible
// as iPhone-only). They used to run on every native platform, which on Android
// meant two rejected promises swallowed by the `.catch` on every cold start.
// `resize: "none"` is also declared in capacitor.config.json, so the mode is
// already applied before the WebView first lays out; these calls keep a
// long-lived session honest if the mode is ever changed at runtime.
if (isIOS()) {
  Keyboard.setResizeMode({ mode: 'none' }).catch(() => null);
  Keyboard.setScroll({ isDisabled: true }).catch(() => null);
}

// Suppress the broken native context menu on the Android WebView (a white panel
// with a logo). Deliberately NOT applied on iOS: there it also removes the
// long-press callout / copy-paste affordance inside text inputs, which are the
// only elements with `user-select` re-enabled.
if (isAndroid()) {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
