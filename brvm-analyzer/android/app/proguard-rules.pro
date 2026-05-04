-keep class com.brvm.analyzer.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class androidx.webkit.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
