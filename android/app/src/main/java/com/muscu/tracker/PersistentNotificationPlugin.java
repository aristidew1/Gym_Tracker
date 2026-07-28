package com.muscu.tracker;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PersistentNotification",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { "android.permission.POST_NOTIFICATIONS" }
        )
    }
)
public class PersistentNotificationPlugin extends Plugin {

    private static final String TAG = "PersistentNotif";
    @Override
    public void load() {
        Log.d(TAG, "PersistentNotificationPlugin loaded");
        PersistentNotificationService.createNotificationChannel(getContext());
    }

    @PluginMethod
    public void show(PluginCall call) {
        Log.d(TAG, "show() called");

        // Check permission on Android 13+
        if (Build.VERSION.SDK_INT >= 33) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS not granted, requesting...");
                requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
                return;
            }
        }

        doShow(call);
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        Log.d(TAG, "Permission result received");
        if (Build.VERSION.SDK_INT >= 33) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "Permission granted, showing notification");
                doShow(call);
            } else {
                Log.d(TAG, "Permission denied");
                call.reject("Notification permission denied");
            }
        } else {
            doShow(call);
        }
    }

    private void doShow(PluginCall call) {
        String title = call.getString("title", "Muscu Tracker");
        String body = call.getString("body", "");

        Log.d(TAG, "doShow: title=" + title + " body=" + body);

        try {
            PersistentNotificationService.start(getContext(), title, body);
            Log.d(TAG, "Persistent foreground notification started");
            call.resolve();
        } catch (RuntimeException exception) {
            Log.e(TAG, "Unable to start persistent notification service", exception);
            call.reject("Unable to start persistent notification", exception);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        PersistentNotificationService.stop(getContext());
        Log.d(TAG, "Persistent foreground notification stopped");
        call.resolve();
    }

    @PluginMethod
    public void startRestTimer(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("notifications", call, "onRestTimerPermissionResult");
            return;
        }
        doStartRestTimer(call);
    }

    @PermissionCallback
    private void onRestTimerPermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33
            || ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            doStartRestTimer(call);
        } else {
            call.reject("Notification permission denied");
        }
    }

    private void doStartRestTimer(PluginCall call) {
        try {
            RestTimerNotificationService.start(
                getContext(),
                // Capacitor decodes JavaScript integer values as Integer, not
                // Long. Reading it as a Long made every rest timer fall back
                // to one second and immediately emit the completion alert.
                Math.max(1, call.getInt("durationSeconds", 1)),
                call.getString("title", "Repos"),
                call.getString("body", "Compte à rebours en cours"),
                call.getString("completedTitle", "Repos terminé"),
                call.getString("completedBody", "C'est parti pour la prochaine série !")
            );
            call.resolve();
        } catch (RuntimeException exception) {
            Log.e(TAG, "Unable to start rest timer notification", exception);
            call.reject("Unable to start rest timer notification", exception);
        }
    }

    @PluginMethod
    public void stopRestTimer(PluginCall call) {
        RestTimerNotificationService.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject result = new JSObject();
        result.put("display", granted ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("notifications", call, "onRequestPermissionsResult");
        } else {
            JSObject result = new JSObject();
            result.put("display", "granted");
            call.resolve(result);
        }
    }

    @PermissionCallback
    private void onRequestPermissionsResult(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject result = new JSObject();
        result.put("display", granted ? "granted" : "denied");
        call.resolve(result);
    }
}
