package com.brvm.analyzer;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private LinearLayout loadingOverlay;
    private SwipeRefreshLayout swipeRefresh;
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        loadingOverlay = findViewById(R.id.loadingOverlay);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        setupWebView();
        setupSwipeRefresh();
        scheduleBackgroundUpdates();
        requestPermissions();

        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadsImagesAutomatically(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString("BRVMAnalyzer/1.0 Android/" + Build.VERSION.RELEASE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false);
        }

        webView.addJavascriptInterface(new BRVMBridge(this), "AndroidBridge");
        WebView.setWebContentsDebuggingEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                new Handler().postDelayed(() -> {
                    loadingOverlay.animate().alpha(0f).setDuration(500)
                        .withEndAction(() -> loadingOverlay.setVisibility(View.GONE)).start();
                    swipeRefresh.setRefreshing(false);
                }, 1000);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file://") || url.startsWith("data:")) {
                    return false;
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return true;
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                TextView loadingText = findViewById(R.id.loadingText);
                if (loadingText != null) {
                    loadingText.setText("Chargement: " + newProgress + "%");
                }
            }
        });
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(
            ContextCompat.getColor(this, R.color.brvm_green),
            ContextCompat.getColor(this, R.color.brvm_gold)
        );
        swipeRefresh.setOnRefreshListener(() -> {
            webView.evaluateJavascript("if(window.BRVMApp) BRVMApp.refreshData();", null);
            new Handler().postDelayed(() -> swipeRefresh.setRefreshing(false), 3000);
        });
    }

    private void scheduleBackgroundUpdates() {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest updateWork = new PeriodicWorkRequest.Builder(
            UpdateWorker.class, 4, TimeUnit.HOURS)
            .setConstraints(constraints)
            .addTag("brvm_update")
            .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "brvm_auto_update",
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            updateWork
        );
    }

    private void requestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    PERMISSION_REQUEST_CODE);
            }
        }
    }

    public boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo networkInfo = cm.getActiveNetworkInfo();
        return networkInfo != null && networkInfo.isConnected();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.evaluateJavascript("if(window.BRVMApp) BRVMApp.onResume();", null);
    }

    public class BRVMBridge {
        private final Context context;

        BRVMBridge(Context ctx) {
            this.context = ctx;
        }

        @JavascriptInterface
        public boolean isOnline() {
            return isNetworkAvailable();
        }

        @JavascriptInterface
        public String getDeviceInfo() {
            return "{\"model\":\"" + Build.MODEL + "\",\"android\":\"" + Build.VERSION.RELEASE + "\",\"sdk\":" + Build.VERSION.SDK_INT + "}";
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public boolean savePdfToStorage(String base64Data, String filename) {
            try {
                byte[] pdfBytes;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    pdfBytes = Base64.getDecoder().decode(base64Data);
                } else {
                    pdfBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                }

                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File brvmDir = new File(downloadsDir, "BRVM_Analyser");
                if (!brvmDir.exists()) brvmDir.mkdirs();

                File pdfFile = new File(brvmDir, filename);
                try (FileOutputStream fos = new FileOutputStream(pdfFile)) {
                    fos.write(pdfBytes);
                }

                runOnUiThread(() -> {
                    Toast.makeText(context, "Rapport sauvegardé: " + filename, Toast.LENGTH_LONG).show();
                    openPdf(pdfFile);
                });
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(context, "Erreur: " + e.getMessage(), Toast.LENGTH_LONG).show());
                return false;
            }
        }

        private void openPdf(File file) {
            try {
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/pdf");
                intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(context, "Ouvrez le PDF depuis Téléchargements/BRVM_Analyser/", Toast.LENGTH_LONG).show();
            }
        }

        @JavascriptInterface
        public void shareReport(String base64Data, String filename) {
            try {
                File cacheDir = new File(context.getCacheDir(), "reports");
                if (!cacheDir.exists()) cacheDir.mkdirs();
                File file = new File(cacheDir, filename);

                byte[] pdfBytes;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    pdfBytes = Base64.getDecoder().decode(base64Data);
                } else {
                    pdfBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                }
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(pdfBytes);
                }

                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("application/pdf");
                shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, "Analyse BRVM - " + filename);
                shareIntent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> context.startActivity(Intent.createChooser(shareIntent, "Partager le rapport")));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(context, "Erreur partage: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void triggerUpdate() {
            Intent serviceIntent = new Intent(context, UpdateService.class);
            context.startService(serviceIntent);
        }

        @JavascriptInterface
        public String getStoredData(String key) {
            return context.getSharedPreferences("brvm_data", Context.MODE_PRIVATE)
                .getString(key, "null");
        }

        @JavascriptInterface
        public void storeData(String key, String value) {
            context.getSharedPreferences("brvm_data", Context.MODE_PRIVATE)
                .edit().putString(key, value).apply();
        }
    }
}
