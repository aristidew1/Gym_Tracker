package fr.aris.gymtrack;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Publishes the optional daily status without keeping a process alive. */
public final class PersistentNotificationManager {
    public static final String CHANNEL_ID = "muscu_persistent";
    public static final int NOTIFICATION_ID = 42;

    private static final String PREFS_NAME = "persistent_notification";
    private static final String PREF_ENABLED = "enabled";
    private static final String PREF_TITLE = "title";
    private static final String PREF_BODY = "body";

    private PersistentNotificationManager() {}

    public static void show(Context context, String title, String body) {
        Context appContext = context.getApplicationContext();
        if (!canPostNotifications(appContext)) return;

        String safeTitle = title == null || title.trim().isEmpty()
            ? appContext.getString(R.string.app_name)
            : title;
        String safeBody = body == null ? "" : body;

        getPreferences(appContext).edit()
            .putBoolean(PREF_ENABLED, true)
            .putString(PREF_TITLE, safeTitle)
            .putString(PREF_BODY, safeBody)
            .apply();

        createNotificationChannel(appContext);
        NotificationManager manager = appContext.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(appContext, safeTitle, safeBody));
    }

    public static void restore(Context context) {
        SharedPreferences preferences = getPreferences(context);
        if (!preferences.getBoolean(PREF_ENABLED, false)) return;
        show(
            context,
            preferences.getString(PREF_TITLE, context.getString(R.string.app_name)),
            preferences.getString(PREF_BODY, "")
        );
    }

    public static void cancel(Context context) {
        getPreferences(context).edit().putBoolean(PREF_ENABLED, false).apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Statut du jour",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Statut quotidien de l'entraînement");
        channel.setShowBadge(false);
        channel.enableVibration(false);
        channel.setSound(null, null);

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private static boolean canPostNotifications(Context context) {
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static android.app.Notification buildNotification(Context context, String title, String body) {
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, flags);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_menu_today)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }
}
