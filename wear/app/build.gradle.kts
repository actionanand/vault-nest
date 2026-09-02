import java.util.regex.Pattern

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val environmentFile = rootProject.file("../src/environments/watch-vault.environment.ts")
val environmentText = environmentFile.readText()
val limitMatcher = Pattern.compile("WATCH_VAULT_MAX_ENTRIES\\s*=\\s*(\\d+)").matcher(environmentText)
check(limitMatcher.find()) { "WATCH_VAULT_MAX_ENTRIES is missing from the Watch Vault environment" }
val watchVaultMaxEntries = limitMatcher.group(1).toInt()
check(watchVaultMaxEntries > 0) { "watchVaultMaxEntries must be positive" }

val versionFile = rootProject.file("../wear-version.json")
val versionText = versionFile.readText()
val androidVersionFile = rootProject.file("../android-version.json")
val androidVersionText = androidVersionFile.readText()
val identityFile = rootProject.file("../wear-config.json")
val identityText = identityFile.readText()

fun jsonNumber(source: String, name: String): Int =
    Regex("\"$name\"\\s*:\\s*(\\d+)").find(source)?.groupValues?.get(1)?.toInt()
        ?: error("$name is missing or invalid")

fun jsonString(source: String, name: String): String =
    Regex("\"$name\"\\s*:\\s*\"([^\"]+)\"").find(source)?.groupValues?.get(1)
        ?: error("$name is missing or invalid")

fun sdkVersion(environmentName: String, fallback: Int): Int =
    System.getenv(environmentName)?.toIntOrNull() ?: fallback

val wearMinSdkVersion = sdkVersion("WEAR_MIN_SDK_VERSION", 30)
val wearTargetSdkVersion = sdkVersion("WEAR_TARGET_SDK_VERSION", 36)
val wearCompileSdkVersion = sdkVersion("WEAR_COMPILE_SDK_VERSION", 36)
val androidBuildToolsVersion = System.getenv("ANDROID_BUILD_TOOLS_VERSION") ?: "36.0.0"
check(wearMinSdkVersion <= wearTargetSdkVersion) { "Wear minSdk cannot exceed targetSdk" }
check(wearTargetSdkVersion <= wearCompileSdkVersion) { "Wear targetSdk cannot exceed compileSdk" }

android {
    namespace = jsonString(identityText, "namespace")
    compileSdk = wearCompileSdkVersion
    buildToolsVersion = androidBuildToolsVersion

    defaultConfig {
        applicationId = jsonString(identityText, "applicationId")
        minSdk = wearMinSdkVersion
        targetSdk = wearTargetSdkVersion
        versionCode = jsonNumber(versionText, "versionCode")
        versionName =
            "${jsonString(androidVersionText, "versionName")}-wear.${jsonNumber(versionText, "wearRevision")}"
        resValue("string", "wear_app_name", jsonString(identityText, "appName"))
        buildConfigField("int", "WATCH_VAULT_MAX_ENTRIES", watchVaultMaxEntries.toString())
    }

    signingConfigs {
        create("release") {
            val path = System.getenv("VAULT_NEST_KEYSTORE_PATH")
            if (!path.isNullOrBlank()) {
                storeFile = file(path)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.03.00"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.wear:wear-remote-interactions:1.2.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
