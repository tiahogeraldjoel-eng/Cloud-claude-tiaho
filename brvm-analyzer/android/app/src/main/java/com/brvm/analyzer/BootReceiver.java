package com.brvm.analyzer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest updateWork = new PeriodicWorkRequest.Builder(
                UpdateWorker.class, 4, TimeUnit.HOURS)
                .setConstraints(constraints)
                .addTag("brvm_update")
                .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "brvm_auto_update",
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                updateWork
            );
        }
    }
}
