-keep class com.sraibridge.sovereign.data.** { *; }
-keep class com.sraibridge.sovereign.ghost.** { *; }

# Rhino loads its classes reflectively and references JDK packages that Android lacks.
-keep class org.mozilla.javascript.** { *; }
-dontwarn org.mozilla.javascript.**
-dontwarn java.beans.**
-dontwarn javax.script.**
-dontwarn jdk.dynalink.**
