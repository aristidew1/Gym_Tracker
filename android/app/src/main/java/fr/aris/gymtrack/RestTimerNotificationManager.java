package fr.aris.gymtrack;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Displays a system-rendered countdown and schedules its completion alert. */
public final class RestTimerNotificationManager {
    public static final String CHANNEL_ID = "muscu_rest_timer";
    public static final String COMPLETE_CHANNEL_ID = "muscu_rest_timer_complete";
    public static final int NOTIFICATION_ID = 43;
    public static final int COMPLETE_NOTIFICATION_ID = 44;

    private static final int ALARM_REQUEST_CODE = 4301;
    private static final String PREFS_NAME = "rest_timer_notification";
    private static final String PREF_ACTIVE = "active";
    private static final String PREF_COMPLETED_TITLE = "completedTitle";
    private static final String PREF_COMPLETED_BODY = "completedBody";
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static Runnable completionFallback;

    private RestTimerNotificationManager() {}

    public static void start(Context context, long durationSeconds, String title, String body,
                             String completedTitle, String completedBody) {
        Context appContext = context.getApplicationContext();
        if (!canPostNotifications(appContext)) return;

        cancelScheduledCompletion(appContext);
        NotificationManager notificationManager = appContext.getSystemService(NotificationManager.class);
        if (notificationManager != null) notificationManager.cancel(COMPLETE_NOTIFICATION_ID);

        long safeDurationSeconds = Math.max(1, durationSeconds);
        long triggerAtElapsedRealtime = SystemClock.elapsedRealtime() + safeDurationSeconds * 1000L;
        long triggerAtWallClock = System.currentTimeMillis() + safeDurationSeconds * 1000L;
        String safeTitle = title == null || title.trim().isEmpty() ? "Repos" : title;
        String safeBody = body == null ? "Compte à rebours en cours" : body;
        String safeCompletedTitle = completedTitle == null || completedTitle.trim().isEmpty()
            ? "Repos terminé"
            : completedTitle;
        String safeCompletedBody = completedBody == null
            ? "C'est parti pour la prochaine série !"
            : completedBody;

        getPreferences(appContext).edit()
            .putBoolean(PREF_ACTIVE, true)
            .putString(PREF_COMPLETED_TITLE, safeCompletedTitle)
            .putString(PREF_COMPLETED_BODY, safeCompletedBody)
            .apply();

        createNotificationChannels(appContext);
        if (notificationManager != null) {
            notificationManager.notify(
                NOTIFICATION_ID,
                buildCountdownNotification(appContext, safeTitle, safeBody, triggerAtWallClock)
            );
        }

        scheduleSystemAlarm(appContext, triggerAtElapsedRealtime);
        completionFallback = () -> complete(appContext);
        HANDLER.postDelayed(completionFallback, safeDurationSeconds * 1000L);
    }

    public static void cancel(Context context) {
        Context appContext = context.getApplicationContext();
        getPreferences(appContext).edit().putBoolean(PREF_ACTIVE, false).apply();
        cancelScheduledCompletion(appContext);
        NotificationManager manager = appContext.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }

    static void complete(Context context) {
        Context appContext = context.getApplicationContext();
        SharedPreferences preferences = getPreferences(appContext);
        if (!preferences.getBoolean(PREF_ACTIVE, false)) return;

        String completedTitle = preferences.getString(PREF_COMPLETED_TITLE, "Repos terminé");
        String completedBody = preferences.getString(
            PREF_COMPLETED_BODY,
            "C'est parti pour la prochaine série !"
        );
        preferences.edit().putBoolean(PREF_ACTIVE, false).apply();
        cancelScheduledCompletion(appContext);

        if (!canPostNotifications(appContext)) return;
        createNotificationChannels(appContext);
        NotificationManager manager = appContext.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.cancel(NOTIFICATION_ID);
        manager.notify(
            COMPLETE_NOTIFICATION_ID,
            new NotificationCompat.Builder(appContext, COMPLETE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setLargeIcon(BitmapFactory.decodeResource(appContext.getResources(), R.mipmap.ic_launcher))
                .setContentTitle(completedTitle)
                .setContentText(completedBody)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(createLaunchIntent(appContext))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build()
        );
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel countdownChannel = new NotificationChannel(
            CHANNEL_ID,
            "Minuteur de repos",
            NotificationManager.IMPORTANCE_LOW
        );
        countdownChannel.setDescription("Compte à rebours du temps de repos");
        countdownChannel.setShowBadge(false);
        countdownChannel.enableVibration(false);
        countdownChannel.setSound(null, null);
        manager.createNotificationChannel(countdownChannel);

        NotificationChannel completionChannel = new NotificationChannel(
            COMPLETE_CHANNEL_ID,
            "Fin du minuteur de repos",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        completionChannel.setDescription("Alerte à la fin d'un temps de repos");
        completionChannel.setShowBadge(false);
        completionChannel.enableVibration(true);
        Uri sound = Settings.System.DEFAULT_NOTIFICATION_URI;
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        completionChannel.setSound(sound, attributes);
        manager.createNotificationChannel(completionChannel);
    }

    private static android.app.Notification buildCountdownNotification(
        Context context,
        String title,
        String body,
        long triggerAtWallClock
    ) {
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title)
            .setContentText(body)
            .setWhen(triggerAtWallClock)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(createLaunchIntent(context))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private static void scheduleSystemAlarm(Context context, long triggerAtElapsedRealtime) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager == null) return;
        PendingIntent operation = createAlarmIntent(context);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
            manager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAtElapsedRealtime,
                operation
            );
        } else {
            // Exact-alarm access is denied by default on recent Android versions.
            // The in-process handler remains exact while the app process is alive;
            // this alarm is the resilient fallback if Android later kills it.
            manager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAtElapsedRealtime,
                operation
            );
        }
    }

    private static void cancelScheduledCompletion(Context context) {
        if (completionFallback != null) {
            HANDLER.removeCallbacks(completionFallback);
            completionFallback = null;
        }
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager != null) manager.cancel(createAlarmIntent(context));
    }

    private static PendingIntent createAlarmIntent(Context context) {
        Intent intent = new Intent(context, RestTimerAlarmReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);
    }

    private static PendingIntent createLaunchIntent(Context context) {
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, NOTIFICATION_ID, launchIntent, flags);
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static boolean canPostNotifications(Context context) {
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }
}
