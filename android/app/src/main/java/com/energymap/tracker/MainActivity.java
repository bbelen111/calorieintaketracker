package com.energymap.tracker;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Get the WebView and disable scrollbars
        WebView webView = this.getBridge().getWebView();
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // Disable the "bounce" glow effect
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }
}
