# Keep JNI-bound native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# ObjectBox generated classes
-keep class io.objectbox.** { *; }
-keep class com.example.localaiindexer.MyObjectBox { *; }
-keep class com.example.localaiindexer.DocumentEntity { *; }
-keep class com.example.localaiindexer.DocumentEntity_ { *; }
