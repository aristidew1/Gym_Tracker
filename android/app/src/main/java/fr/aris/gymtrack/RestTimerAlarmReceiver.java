package fr.aris.gymtrack;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives the system alarm that marks the end of a rest timer. */
public final class RestTimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        RestTimerNotificationManager.complete(context);
    }
}
