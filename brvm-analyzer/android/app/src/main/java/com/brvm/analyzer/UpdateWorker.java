package com.brvm.analyzer;

import android.content.Context;
import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class UpdateWorker extends Worker {

    public UpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            if (!isMarketHours()) return Result.success();

            Context ctx = getApplicationContext();
            String data = fetchBRVMData();
            if (data != null && !data.isEmpty()) {
                ctx.getSharedPreferences("brvm_data", Context.MODE_PRIVATE)
                    .edit()
                    .putString("live_quotes", data)
                    .putLong("last_update", System.currentTimeMillis())
                    .apply();
            }

            Intent serviceIntent = new Intent(ctx, UpdateService.class);
            ctx.startService(serviceIntent);

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    private boolean isMarketHours() {
        Calendar cal = Calendar.getInstance();
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);
        boolean isWeekday = dayOfWeek >= Calendar.MONDAY && dayOfWeek <= Calendar.FRIDAY;
        return isWeekday && hour >= 9 && hour <= 18;
    }

    private String fetchBRVMData() {
        try {
            URL url = new URL("https://www.brvm.org/fr/cours-des-actions/0/all");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("User-Agent", "BRVMAnalyzer/1.0");

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception ignored) {}
        return null;
    }
}
