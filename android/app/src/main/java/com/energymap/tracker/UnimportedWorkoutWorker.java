package com.energymap.tracker;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.HealthConnectFeatures;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.response.ReadRecordsResponse;
import androidx.health.connect.client.time.TimeRangeFilter;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import kotlin.jvm.JvmClassMappingKt;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Periodic WorkManager worker that checks Health Connect for newly recorded
 * workouts while Energy Map is closed and posts an "Unimported workout"
 * notification matching the foreground planner's deduplication & deep-link
 * contract.
 */
public class UnimportedWorkoutWorker extends Worker {

    private static final String TAG = "UnimportedWorkoutWorker";
    private static final String CAPACITOR_PREFS_NAME = "CapacitorStorage";
    private static final String CAPACITOR_NOTIFIED_WORKOUTS_KEY = "energyMapNotifiedHealthWorkouts";
    private static final String WORKOUTS_CHANNEL_ID = "energy_map_workouts_v2";
    private static final String KEY_NOTIF_SEQ = "bgWorkoutNotifSeq";
    private static final int UNIMPORTED_WORKOUT_ID_BASE = 2200;
    private static final int MAX_STORED_WORKOUT_IDS = 80;
    private static final long MIN_WORKOUT_MINUTES = 5L;
    private static final long OVERLAP_TOLERANCE_MS = 5L * 60_000L;

    public UnimportedWorkoutWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences bgPrefs = context.getSharedPreferences(
            NotificationReliabilityPlugin.PREFS_NAME,
            Context.MODE_PRIVATE
        );

        if (!bgPrefs.getBoolean(NotificationReliabilityPlugin.KEY_ENABLED, false)) {
            return Result.success();
        }

        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return Result.success();
        }

        try {
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                return Result.success();
            }

            HealthConnectClient client = HealthConnectClient.getOrCreate(context);
            int bgFeature = client
                .getFeatures()
                .getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND);
            if (bgFeature != HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) {
                return Result.success();
            }

            Set<String> granted = NotificationReliabilityPlugin.awaitSuspend(continuation ->
                client.getPermissionController().getGrantedPermissions(continuation)
            );
            String exercisePermission = HealthPermission.getReadPermission(
                JvmClassMappingKt.getKotlinClass(ExerciseSessionRecord.class)
            );
            if (
                granted == null ||
                !granted.contains(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND) ||
                !granted.contains(exercisePermission)
            ) {
                return Result.success();
            }

            Instant now = Instant.now();
            Instant lookbackStart = now.minus(48, ChronoUnit.HOURS);

            ReadRecordsRequest<ExerciseSessionRecord> request = new ReadRecordsRequest<>(
                JvmClassMappingKt.getKotlinClass(ExerciseSessionRecord.class),
                TimeRangeFilter.between(lookbackStart, now),
                Collections.emptySet(),
                true,
                50,
                null
            );

            ReadRecordsResponse<ExerciseSessionRecord> response =
                NotificationReliabilityPlugin.awaitSuspend(continuation ->
                    client.readRecords(request, continuation)
                );
            if (response == null || response.getRecords().isEmpty()) {
                return Result.success();
            }

            Set<String> loggedWorkoutIds = readStringSet(
                bgPrefs.getString(NotificationReliabilityPlugin.KEY_LOGGED_WORKOUT_IDS, "[]")
            );
            List<long[]> loggedWindows = readSessionWindows(
                bgPrefs.getString(NotificationReliabilityPlugin.KEY_LOGGED_SESSION_WINDOWS, "[]")
            );

            SharedPreferences capPrefs = context.getSharedPreferences(
                CAPACITOR_PREFS_NAME,
                Context.MODE_PRIVATE
            );
            List<String> notifiedList = mergeUniqueLists(
                readStringList(bgPrefs.getString(NotificationReliabilityPlugin.KEY_NOTIFIED_WORKOUT_IDS, "[]")),
                readStringList(capPrefs.getString(CAPACITOR_NOTIFIED_WORKOUTS_KEY, "[]"))
            );
            Set<String> notifiedSet = new HashSet<>(notifiedList);

            List<ExerciseSessionRecord> unimported = new ArrayList<>();
            for (ExerciseSessionRecord record : response.getRecords()) {
                String id = record.getMetadata() != null ? record.getMetadata().getId() : null;
                if (id == null || id.trim().isEmpty()) {
                    continue;
                }
                if (notifiedSet.contains(id) || loggedWorkoutIds.contains(id)) {
                    continue;
                }
                long startMs = record.getStartTime().toEpochMilli();
                long endMs = record.getEndTime().toEpochMilli();
                if (endMs <= startMs) {
                    continue;
                }
                long durationMinutes = Math.round(
                    Duration.between(record.getStartTime(), record.getEndTime()).getSeconds() / 60.0
                );
                if (durationMinutes < MIN_WORKOUT_MINUTES) {
                    continue;
                }
                if (overlapsLoggedSession(startMs, endMs, loggedWindows)) {
                    continue;
                }
                unimported.add(record);
            }

            if (unimported.isEmpty()) {
                return Result.success();
            }

            for (ExerciseSessionRecord record : unimported) {
                notifiedList.add(record.getMetadata().getId());
            }
            if (notifiedList.size() > MAX_STORED_WORKOUT_IDS) {
                notifiedList = notifiedList.subList(
                    notifiedList.size() - MAX_STORED_WORKOUT_IDS,
                    notifiedList.size()
                );
            }
            String serializedIds = toJsonArrayString(notifiedList);
            bgPrefs
                .edit()
                .putString(NotificationReliabilityPlugin.KEY_NOTIFIED_WORKOUT_IDS, serializedIds)
                .apply();
            capPrefs
                .edit()
                .putString(CAPACITOR_NOTIFIED_WORKOUTS_KEY, serializedIds)
                .apply();

            postNotification(context, bgPrefs, unimported);
            return Result.success();
        } catch (Exception e) {
            Log.w(TAG, "Background Health Connect workout check failed", e);
            return Result.success();
        }
    }

    private void postNotification(
        Context context,
        SharedPreferences bgPrefs,
        List<ExerciseSessionRecord> unimported
    ) {
        int count = unimported.size();
        ExerciseSessionRecord first = unimported.get(0);
        long firstDurationMin = Math.max(
            1L,
            Math.round(Duration.between(first.getStartTime(), first.getEndTime()).getSeconds() / 60.0)
        );
        String workoutLabel = describeExerciseType(first.getExerciseType());

        String title = count == 1
            ? "Unimported workout detected"
            : count + " unimported workouts detected";
        String body = count == 1
            ? firstDurationMin + " min " + workoutLabel + " from Health Connect. Tap to import so today\u2019s TDEE includes it."
            : "Tap to import " + count + " synced workouts from Health Connect into your activity log.";

        int seq = bgPrefs.getInt(KEY_NOTIF_SEQ, 0);
        int notificationId = UNIMPORTED_WORKOUT_ID_BASE + (seq % 50);
        bgPrefs.edit().putInt(KEY_NOTIF_SEQ, (seq + 1) % 50).apply();

        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setAction(Intent.ACTION_MAIN);
        tapIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        tapIntent.putExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, notificationId);
        tapIntent.putExtra(LocalNotificationManager.ACTION_INTENT_KEY, "tap");

        try {
            JSONObject notifJson = new JSONObject();
            notifJson.put("id", notificationId);
            notifJson.put("title", title);
            notifJson.put("body", body);
            JSONObject extra = new JSONObject();
            extra.put("route", "open_cardio_import");
            notifJson.put("extra", extra);
            tapIntent.putExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY, notifJson.toString());
        } catch (Exception ignored) {
            // Best-effort deep-link payload.
        }

        int flags = PendingIntent.FLAG_CANCEL_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            tapIntent,
            flags
        );

        int smallIcon = context
            .getResources()
            .getIdentifier("ic_stat_energy_map", "drawable", context.getPackageName());
        if (smallIcon == 0) {
            smallIcon = android.R.drawable.ic_dialog_info;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            WORKOUTS_CHANNEL_ID
        )
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(smallIcon)
            .setColor(Color.parseColor("#3B82F6"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "POST_NOTIFICATIONS not granted when posting background workout alert", e);
        }
    }

    private static boolean overlapsLoggedSession(
        long workoutStartMs,
        long workoutEndMs,
        List<long[]> windows
    ) {
        for (long[] window : windows) {
            if (
                window[0] <= workoutEndMs + OVERLAP_TOLERANCE_MS &&
                window[1] >= workoutStartMs - OVERLAP_TOLERANCE_MS
            ) {
                return true;
            }
        }
        return false;
    }

    private static List<long[]> readSessionWindows(String raw) {
        List<long[]> windows = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                long start = obj.optLong("startMs", -1L);
                long end = obj.optLong("endMs", -1L);
                if (start > 0L && end > start) {
                    windows.add(new long[] { start, end });
                }
            }
        } catch (Exception ignored) {
            // Return whatever parsed cleanly.
        }
        return windows;
    }

    private static Set<String> readStringSet(String raw) {
        return new HashSet<>(readStringList(raw));
    }

    private static List<String> readStringList(String raw) {
        List<String> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < array.length(); i++) {
                String value = array.optString(i, "").trim();
                if (!value.isEmpty()) {
                    list.add(value);
                }
            }
        } catch (Exception ignored) {
            // Return empty list on malformed JSON.
        }
        return list;
    }

    private static List<String> mergeUniqueLists(List<String> first, List<String> second) {
        List<String> merged = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String item : first) {
            if (seen.add(item)) merged.add(item);
        }
        for (String item : second) {
            if (seen.add(item)) merged.add(item);
        }
        return merged;
    }

    private static String toJsonArrayString(List<String> items) {
        JSONArray array = new JSONArray();
        for (String item : items) {
            array.put(item);
        }
        return array.toString();
    }

    private static String describeExerciseType(int exerciseType) {
        switch (exerciseType) {
            case ExerciseSessionRecord.EXERCISE_TYPE_RUNNING:
            case ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL:
                return "running";
            case ExerciseSessionRecord.EXERCISE_TYPE_BIKING:
            case ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY:
                return "cycling";
            case ExerciseSessionRecord.EXERCISE_TYPE_WALKING:
                return "walking";
            case ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER:
            case ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL:
                return "swimming";
            case ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING:
            case ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING:
                return "strength training";
            case ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING:
                return "HIIT";
            case ExerciseSessionRecord.EXERCISE_TYPE_HIKING:
                return "hiking";
            case ExerciseSessionRecord.EXERCISE_TYPE_ROWING:
            case ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE:
                return "rowing";
            case ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL:
                return "elliptical";
            case ExerciseSessionRecord.EXERCISE_TYPE_YOGA:
                return "yoga";
            default:
                return "workout";
        }
    }
}
