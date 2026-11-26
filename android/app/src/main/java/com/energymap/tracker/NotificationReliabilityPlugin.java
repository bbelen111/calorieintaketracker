package com.energymap.tracker;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.HealthConnectFeatures;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import kotlin.Result;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;
import org.json.JSONArray;

/**
 * Native Android reliability bridge for Energy Map notifications:
 * 1. Battery optimization status + one-tap App Info shortcut (Play-compliant).
 * 2. Health Connect background-read permission check & request.
 * 3. WorkManager periodic sync for unimported Health Connect workouts while
 *    the app is closed.
 */
@CapacitorPlugin(name = "NotificationReliability")
public class NotificationReliabilityPlugin extends Plugin {

    private static final String TAG = "NotificationReliability";
    static final String PREFS_NAME = "EnergyMapBgWorkoutSync";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_LOGGED_WORKOUT_IDS = "loggedWorkoutIds";
    static final String KEY_LOGGED_SESSION_WINDOWS = "loggedSessionWindows";
    static final String KEY_NOTIFIED_WORKOUT_IDS = "notifiedWorkoutIds";
    static final String WORK_NAME = "energy_map_unimported_workout_sync";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdownNow();
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Context context = getContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            boolean ignoring =
                pm == null ||
                Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                pm.isIgnoringBatteryOptimizations(context.getPackageName());
            result.put("ignoring", ignoring);
            call.resolve(result);
        } catch (Exception e) {
            Log.w(TAG, "Could not inspect battery optimization state", e);
            result.put("ignoring", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            try {
                Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                appDetails.setData(Uri.parse("package:" + getContext().getPackageName()));
                appDetails.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(appDetails);
                result.put("opened", true);
                call.resolve(result);
            } catch (Exception primaryError) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getActivity().startActivity(fallback);
                    result.put("opened", true);
                    call.resolve(result);
                } catch (Exception fallbackError) {
                    call.reject("Could not open battery settings: " + fallbackError.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void checkHealthBackgroundPermission(PluginCall call) {
        executor.execute(() -> {
            String status = resolveHealthBackgroundStatus(getContext());
            JSObject result = new JSObject();
            result.put("status", status);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void requestHealthBackgroundPermission(PluginCall call) {
        executor.execute(() -> {
            Context context = getContext();
            String currentStatus = resolveHealthBackgroundStatus(context);
            if ("unavailable".equals(currentStatus) || "granted".equals(currentStatus)) {
                JSObject result = new JSObject();
                result.put("status", currentStatus);
                call.resolve(result);
                return;
            }

            try {
                Intent intent = PermissionController.createRequestPermissionResultContract()
                    .createIntent(
                        context,
                        Collections.singleton(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
                    );
                startActivityForResult(call, intent, "healthBackgroundPermissionCallback");
            } catch (Exception e) {
                Log.w(TAG, "Could not launch Health Connect background permission sheet", e);
                JSObject result = new JSObject();
                result.put("status", "denied");
                call.resolve(result);
            }
        });
    }

    @ActivityCallback
    private void healthBackgroundPermissionCallback(PluginCall call, ActivityResult result) {
        executor.execute(() -> {
            Context context = getContext();
            String status = resolveHealthBackgroundStatus(context);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
            applyWorkerSchedule(context, enabled && "granted".equals(status));

            JSObject payload = new JSObject();
            payload.put("status", status);
            call.resolve(payload);
        });
    }

    @PluginMethod
    public void syncBackgroundWorkoutContext(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        JSArray loggedIds = call.getArray("loggedWorkoutIds", new JSArray());
        JSArray loggedWindows = call.getArray("loggedSessionWindows", new JSArray());
        JSArray notifiedIds = call.getArray("notifiedWorkoutIds", new JSArray());

        executor.execute(() -> {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .putString(KEY_LOGGED_WORKOUT_IDS, toJsonString(loggedIds))
                .putString(KEY_LOGGED_SESSION_WINDOWS, toJsonString(loggedWindows))
                .putString(KEY_NOTIFIED_WORKOUT_IDS, toJsonString(notifiedIds))
                .apply();

            String bgStatus = resolveHealthBackgroundStatus(context);
            boolean scheduled = enabled && "granted".equals(bgStatus);
            applyWorkerSchedule(context, scheduled);

            JSObject result = new JSObject();
            result.put("scheduled", scheduled);
            result.put("backgroundPermission", bgStatus);
            call.resolve(result);
        });
    }

    private static String toJsonString(JSONArray array) {
        return array != null ? array.toString() : "[]";
    }

    static void applyWorkerSchedule(Context context, boolean shouldSchedule) {
        try {
            WorkManager workManager = WorkManager.getInstance(context);
            if (shouldSchedule) {
                PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    UnimportedWorkoutWorker.class,
                    15,
                    TimeUnit.MINUTES
                ).build();
                workManager.enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request
                );
            } else {
                workManager.cancelUniqueWork(WORK_NAME);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not update background workout worker schedule", e);
        }
    }

    static String resolveHealthBackgroundStatus(Context context) {
        try {
            int sdkStatus = HealthConnectClient.getSdkStatus(context);
            if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
                return "unavailable";
            }
            HealthConnectClient client = HealthConnectClient.getOrCreate(context);
            int featureStatus = client
                .getFeatures()
                .getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND);
            if (featureStatus != HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) {
                return "unavailable";
            }
            Set<String> granted = awaitSuspend(continuation ->
                client.getPermissionController().getGrantedPermissions(continuation)
            );
            if (
                granted != null &&
                granted.contains(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
            ) {
                return "granted";
            }
            return "denied";
        } catch (Exception e) {
            Log.w(TAG, "Health Connect background permission check failed", e);
            return "unavailable";
        }
    }

    @FunctionalInterface
    interface SuspendInvoker<T> {
        Object invoke(Continuation<? super T> continuation);
    }

    @SuppressWarnings("unchecked")
    static <T> T awaitSuspend(SuspendInvoker<T> invoker) throws Exception {
        CompletableFuture<T> future = new CompletableFuture<>();
        Continuation<T> continuation = new Continuation<T>() {
            @Override
            public CoroutineContext getContext() {
                return EmptyCoroutineContext.INSTANCE;
            }

            @Override
            public void resumeWith(Object o) {
                if (o instanceof Result.Failure) {
                    Throwable ex = ((Result.Failure) o).exception;
                    future.completeExceptionally(ex);
                } else {
                    future.complete((T) o);
                }
            }
        };

        Object result = invoker.invoke(continuation);
        if (result != kotlin.coroutines.intrinsics.IntrinsicsKt.getCOROUTINE_SUSPENDED()) {
            return (T) result;
        }
        return future.get(20, TimeUnit.SECONDS);
    }
}
