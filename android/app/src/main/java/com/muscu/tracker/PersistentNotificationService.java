package com.muscu.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.graphics.BitmapFactory;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

public class PersistentNotificationService extends Service {

    public static final String CHANNEL_ID = "muscu_persistent";
    public static final int NOTIFICATION_ID = 42;

    private static final String ACTION_SHOW = "com.muscu.tracker.action.SHOW_PERSISTENT_NOTIFICATION";
    private static final String ACTION_REPOST = "com.muscu.tracker.action.REPOST_PERSISTENT_NOTIFICATION";
    private static final long REPOST_DELAY_MS = 500L;
    private static final String PREFS_NAME = "persistent_notification";
    private static final String PREF_ENABLED = "enabled";
    private static final String PREF_TITLE = "title";
    private static final String PREF_BODY = "body";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_BODY = "body";

    public static void start(Context context, String title, String body) {
        Intent intent = new Intent(context, PersistentNotificationService.class)
            .setAction(ACTION_SHOW)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void restore(Context context) {
        SharedPreferences preferences = getPreferences(context);
        if (!preferences.getBoolean(PREF_ENABLED, false)) {
            return;
        }

        start(
            context,
            preferences.getString(PREF_TITLE, context.getString(R.string.app_name)),
            preferences.getString(PREF_BODY, "")
        );
    }

    public static void repostAfterDismissal(Context context) {
        if (!getPreferences(context).getBoolean(PREF_ENABLED, false)) {
            return;
        }

        Intent intent = new Intent(context, PersistentNotificationService.class)
            .setAction(ACTION_REPOST);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stop(Context context) {
        getPreferences(context).edit().putBoolean(PREF_ENABLED, false).apply();
        context.stopService(new Intent(context, PersistentNotificationService.class));

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Statut du jour",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Notification persistante - statut entraînement");
        channel.setShowBadge(false);
        channel.enableVibration(false);
        channel.setSound(null, null);

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences preferences = getPreferences(this);
        if (intent == null && !preferences.getBoolean(PREF_ENABLED, false)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent == null
            ? preferences.getString(PREF_TITLE, getString(R.string.app_name))
            : intent.getStringExtra(EXTRA_TITLE);
        String body = intent == null
            ? preferences.getString(PREF_BODY, "")
            : intent.getStringExtra(EXTRA_BODY);

        if (title == null || title.trim().isEmpty()) {
            title = getString(R.string.app_name);
        }
        if (body == null) {
            body = "";
        }

        if (intent != null && ACTION_REPOST.equals(intent.getAction())) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                SharedPreferences currentPreferences = getPreferences(this);
                if (!currentPreferences.getBoolean(PREF_ENABLED, false)) {
                    return;
                }

                showForegroundNotification(
                    currentPreferences.getString(PREF_TITLE, getString(R.string.app_name)),
                    currentPreferences.getString(PREF_BODY, "")
                );
            }, REPOST_DELAY_MS);
            return START_STICKY;
        }

        preferences.edit()
            .putBoolean(PREF_ENABLED, true)
            .putString(PREF_TITLE, title)
            .putString(PREF_BODY, body)
            .apply();

        showForegroundNotification(title, body);

        return START_STICKY;
    }

    private void showForegroundNotification(String title, String body) {
        int foregroundServiceType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            : 0;
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(title, body),
            foregroundServiceType
        );
    }

    private Notification buildNotification(String title, String body) {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            pendingIntentFlags
        );

        Intent dismissedIntent = new Intent(this, NotificationDismissedReceiver.class);
        PendingIntent deleteIntent = PendingIntent.getBroadcast(
            this,
            NOTIFICATION_ID,
            dismissedIntent,
            pendingIntentFlags
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_menu_today)
            .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(contentIntent)
            .setDeleteIntent(deleteIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();

        notification.flags |= Notification.FLAG_ONGOING_EVENT;
        notification.flags |= Notification.FLAG_NO_CLEAR;
        return notification;
    }

    @Override
    public void onDestroy() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
