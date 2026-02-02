package com.energymap.tracker;

import android.os.Build;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NavigationBar")
public class NavigationBarPlugin extends Plugin {

    @PluginMethod
    public void setLightNavigationBar(PluginCall call) {
        boolean light = call.getBoolean("light", true);

        getActivity().runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    WindowInsetsControllerCompat wic = new WindowInsetsControllerCompat(
                        getActivity().getWindow(),
                        getActivity().getWindow().getDecorView()
                    );
                    wic.setAppearanceLightNavigationBars(light);
                    call.resolve();
                } else {
                    call.reject("Navigation bar icon color requires Android 11+");
                }
            } catch (Exception e) {
                call.reject("Failed to set navigation bar appearance: " + e.getMessage());
            }
        });
    }
}
