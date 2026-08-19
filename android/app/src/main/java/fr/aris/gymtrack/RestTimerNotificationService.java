package fr.aris.gymtrack;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.SystemClock;
import android.provider.Settings;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/** Keeps a rest countdown visible and accurate while the app is backgrounded. */
public class RestTimerNotificationService extends Service {
    public static final String CHANNEL_ID = "muscu_rest_timer";
    public static final String COMPLETE_CHANNEL_ID = "muscu_rest_timer_complete";
    public static final int NOTIFICATION_ID = 43;
    public static final int COMPLETE_NOTIFICATION_ID = 44;

    private static final String ACTION_START = "fr.aris.gymtrack.action.START_REST_TIMER";
    private static final String ACTION_CANCEL = "fr.aris.gymtrack.action.CANCEL_REST_TIMER";
    private static final String EXTRA_DURATION_SECONDS = "durationSeconds";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_BODY = "body";
    private static final String EXTRA_COMPLETED_TITLE = "completedTitle";
    private static final String EXTRA_COMPLETED_BODY = "completedBody";

    private final Handler handler = new Handler();
    private long endsAtElapsedRealtime;
    private String title;
    private String body;
    private String completedTitle;
    private String completedBody;
    private final Runnable ticker = this::updateCountdown;

    public static void start(Context context, long durationSeconds, String title, String body,
                             String completedTitle, String completedBody) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(COMPLETE_NOTIFICATION_ID);

        Intent intent = new Intent(context, RestTimerNotificationService.class)
            .setAction(ACTION_START)
            .putExtra(EXTRA_DURATION_SECONDS, Math.max(1, durationSeconds))
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
            .putExtra(EXTRA_COMPLETED_TITLE, completedTitle)
            .putExtra(EXTRA_COMPLETED_BODY, completedBody);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void cancel(Context context) {
        context.stopService(new Intent(context, RestTimerNotificationService.class));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel countdownChannel = new NotificationChannel(
            CHANNEL_ID, "Minuteur de repos", NotificationManager.IMPORTANCE_LOW
        );
        countdownChannel.setDescription("Compte à rebours du temps de repos");
        countdownChannel.setShowBadge(false);
        countdownChannel.enableVibration(false);
        countdownChannel.setSound(null, null);
        manager.createNotificationChannel(countdownChannel);

        NotificationChannel completionChannel = new NotificationChannel(
            COMPLETE_CHANNEL_ID, "Fin du minuteur de repos", NotificationManager.IMPORTANCE_DEFAULT
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

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_CANCEL.equals(intent.getAction())) {
            stopTimer();
            return START_NOT_STICKY;
        }

        title = intent.getStringExtra(EXTRA_TITLE);
        body = intent.getStringExtra(EXTRA_BODY);
        completedTitle = intent.getStringExtra(EXTRA_COMPLETED_TITLE);
        completedBody = intent.getStringExtra(EXTRA_COMPLETED_BODY);
        if (title == null || title.trim().isEmpty()) title = "Repos";
        if (body == null) body = "Compte à rebours en cours";
        if (completedTitle == null || completedTitle.trim().isEmpty()) completedTitle = "Repos terminé";
        if (completedBody == null) completedBody = "C'est parti pour la prochaine série !";

        long durationSeconds = Math.max(1, intent.getLongExtra(EXTRA_DURATION_SECONDS, 1));
        endsAtElapsedRealtime = SystemClock.elapsedRealtime() + durationSeconds * 1000L;
        handler.removeCallbacks(ticker);

        // Starting immediately is required for a foreground service, then the
        // same notification is refreshed once per second with the remaining time.
        startForegroundNotification(durationSeconds);
        updateCountdown();
        return START_NOT_STICKY;
    }

    private void updateCountdown() {
        long remainingMilliseconds = Math.max(0, endsAtElapsedRealtime - SystemClock.elapsedRealtime());
        long remainingSeconds = (long) Math.ceil(remainingMilliseconds / 1000d);
        if (remainingSeconds <= 0) {
            finishTimer();
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildCountdownNotification(remainingSeconds));
        handler.postDelayed(ticker, Math.min(1000L, remainingMilliseconds));
    }

    private void startForegroundNotification(long remainingSeconds) {
        int foregroundServiceType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildCountdownNotification(remainingSeconds), foregroundServiceType);
    }

    private Notification buildCountdownNotification(long remainingSeconds) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title)
            .setContentText(body + " · " + formatTime(remainingSeconds))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body + " · " + formatTime(remainingSeconds)))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(createLaunchIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private void finishTimer() {
        handler.removeCallbacks(ticker);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
            manager.notify(COMPLETE_NOTIFICATION_ID, new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
                .setContentTitle(completedTitle)
                .setContentText(completedBody)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(createLaunchIntent())
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build());
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private PendingIntent createLaunchIntent() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, NOTIFICATION_ID, launchIntent, flags);
    }

    private String formatTime(long seconds) {
        return String.format(java.util.Locale.getDefault(), "%d:%02d", seconds / 60, seconds % 60);
    }

    private void stopTimer() {
        handler.removeCallbacks(ticker);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
