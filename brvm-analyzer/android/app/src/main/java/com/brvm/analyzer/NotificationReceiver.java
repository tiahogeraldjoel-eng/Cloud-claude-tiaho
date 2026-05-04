package com.brvm.analyzer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotificationReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getStringExtra("action");
        if ("daily_update".equals(action)) {
            Intent serviceIntent = new Intent(context, UpdateService.class);
            context.startService(serviceIntent);
        }
    }
}
