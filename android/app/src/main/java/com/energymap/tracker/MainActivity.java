package com.energymap.tracker;

import android.os.Bundle;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register custom plugins
        registerPlugin(NavigationBarPlugin.class);

        // Get the WebView and disable scrollbars
        WebView webView = this.getBridge().getWebView();
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // Disable the "bounce" glow effect
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        // Enable algorithmic darkening so the WebView renders
        // dark-themed native controls (cursor handles, selection, etc.)
        WebSettings settings = webView.getSettings();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, true);
        }
    }

    // Suppress the broken native ActionMode popup (the white panel with
    // Capacitor logo that Samsung OneUI shows for text selection).
    // Block both PRIMARY (full-screen) and FLOATING (toolbar) modes —
    // our web app handles copy/paste via contextmenu prevention in JS.
    @Override
    public void onActionModeStarted(ActionMode mode) {
        mode.finish();
    }
}
