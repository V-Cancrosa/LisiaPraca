plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Podpis: plik i hasło przychodzą ze zmiennych środowiskowych (GitHub Actions, sekrety repozytorium).
val keystoreFile: String? = System.getenv("KEYSTORE_FILE")

android {
    namespace = "pl.vcancrosa.lisiapraca"
    compileSdk = 35

    defaultConfig {
        applicationId = "pl.vcancrosa.lisiapraca"
        minSdk = 30
        // 34: bez wymuszonego trybu edge-to-edge, który ukrywałby górę strony pod paskiem stanu.
        targetSdk = 34
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0.0"
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = "lisiapraca"
                keyPassword = System.getenv("KEYSTORE_PASSWORD")
                storeType = "pkcs12"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystoreFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}
