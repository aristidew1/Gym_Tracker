package fr.aris.gymtrack;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotificationDismissedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        PersistentNotificationService.repostAfterDismissal(context);
    }
}
