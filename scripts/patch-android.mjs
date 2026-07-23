import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const capacitorConfigPath = resolve('android/app/src/main/assets/capacitor.config.json');
const capacitorConfig = JSON.parse(await readFile(capacitorConfigPath, 'utf8'));
const appId = capacitorConfig.appId;

if (typeof appId !== 'string' || !appId.trim()) {
  throw new Error(`Android appId is missing from ${capacitorConfigPath}.`);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const activityPath = resolve('android/app/src/main/java', ...appId.split('.'), 'MainActivity.java');
const credentialCopyActivityPath = resolve(
  'android/app/src/main/java',
  ...appId.split('.'),
  'CredentialCopyActivity.java',
);
const credentialShortcutStorePath = resolve(
  'android/app/src/main/java',
  ...appId.split('.'),
  'CredentialShortcutStore.java',
);
const legacyCredentialReceiverPath = resolve(
  'android/app/src/main/java',
  ...appId.split('.'),
  'CredentialCopyReceiver.java',
);
const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const gradlePath = resolve('android/app/build.gradle');
const notificationIconPath = resolve('android/app/src/main/res/drawable/ic_stat_vault_nest.xml');
const resPath = resolve('android/app/src/main/res');
const splashLogoSourcePath = resolve('public/vault-nest.png');
const splashLogoPath = resolve(resPath, 'drawable-nodpi/vault_nest_splash_logo.png');
const splashIconPath = resolve(resPath, 'drawable/vault_nest_splash_icon.xml');
const splashPath = resolve(resPath, 'drawable/splash.xml');

await access(activityPath).catch(() => {
  throw new Error(
    `Android project file not found: ${activityPath}. Run "npx cap add android" first.`,
  );
});

let manifest = await readFile(manifestPath, 'utf8');
if (!manifest.includes('android.permission.USE_BIOMETRIC')) {
  manifest = manifest
    .replace('<manifest', '<manifest')
    .replace(
      /(<manifest[^>]*>)/,
      '$1\n    <uses-permission android:name="android.permission.USE_BIOMETRIC" />',
    );
  await writeFile(manifestPath, manifest, 'utf8');
}
if (!manifest.includes('android.permission.CAMERA')) {
  manifest = manifest.replace(
    /(<manifest[^>]*>)/,
    '$1\n    <uses-permission android:name="android.permission.CAMERA" />',
  );
  await writeFile(manifestPath, manifest, 'utf8');
}
manifest = manifest.replace(
  /<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>/,
  (activity) => {
    if (activity.includes('android:theme=')) {
      return activity.replace(
        /android:theme="[^"]*"/,
        'android:theme="@style/AppTheme.NoActionBarLaunch"',
      );
    }
    return activity.replace(
      />$/,
      '\n            android:theme="@style/AppTheme.NoActionBarLaunch">',
    );
  },
);
manifest = manifest.replace(
  /\s*<receiver\b(?=[^>]*android:name="\.CredentialCopyReceiver")[^>]*\/>/,
  '',
);
if (!manifest.includes('.CredentialCopyActivity')) {
  manifest = manifest.replace(
    /(<\/application>)/,
    `        <activity
            android:name=".CredentialCopyActivity"
            android:excludeFromRecents="true"
            android:exported="false"
            android:noHistory="true"
            android:taskAffinity=""
            android:theme="@style/VaultNest.CredentialCopy" />
    $1`,
  );
}
await writeFile(manifestPath, manifest, 'utf8');
if (await fileExists(legacyCredentialReceiverPath)) {
  await rm(legacyCredentialReceiverPath);
}

let gradle = await readFile(gradlePath, 'utf8');
if (!gradle.includes('androidx.biometric:biometric')) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'",
  );
  await writeFile(gradlePath, gradle, 'utf8');
}

await mkdir(dirname(notificationIconPath), { recursive: true });
await writeFile(
  notificationIconPath,
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M17,8h-1V6a4,4 0,0 0,-8,0v2H7a2,2 0,0 0,-2,2v9a2,2 0,0 0,2,2h10a2,2 0,0 0,2,-2v-9a2,2 0,0 0,-2,-2zM10,6a2,2 0,0 1,4,0v2h-4z" />
</vector>`,
  'utf8',
);

const source = `package ${appId};

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends BridgeActivity {
  private static final int CREATE_BACKUP_REQUEST = 5101;
  private static final int OPEN_BACKUP_REQUEST = 5102;
  private static final int SAVE_EVIDENCE_REQUEST = 5103;
  private static final String KEY_ALIAS = "vault_nest_biometric_key";
  private static final String SECURITY_PREFERENCES = "vault_nest_security";
  private static final String EVIDENCE_KEY_ALIAS = "vault_nest_intrusion_evidence_key";
  private static final String CREDENTIAL_CHANNEL_ID = "vault-nest-credential-copy";
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private byte[] pendingBackup;
  private volatile boolean vaultUnlocked = false;
  private boolean darkMode;
  private View launchOverlay;
  private long launchOverlayShownAt;
  private Runnable clipboardClearTask;
  private Runnable notificationCleanupTask;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    showLaunchOverlay();
    getBridge().getWebView().addJavascriptInterface(new VaultNestNativeBridge(), "VaultNestNative");
    getBridge().getWebView().addJavascriptInterface(new SystemBarsBridge(), "VaultNestSystemBars");
    darkMode = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
      == Configuration.UI_MODE_NIGHT_YES;
    getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#0E1713")));
    getBridge().getWebView().setBackgroundColor(Color.parseColor(darkMode ? "#0E1713" : "#F4F6F4"));
    applyLaunchBarStyle();
  }

  @Override
  public void onResume() {
    super.onResume();
    if (launchOverlay == null) applySystemBars(darkMode);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus && launchOverlay == null) applySystemBars(darkMode);
  }

  public class SystemBarsBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) {
      darkMode = enabled;
      runOnUiThread(() -> applySystemBars(enabled));
    }
  }

  @SuppressWarnings("deprecation")
  private void applySystemBars(boolean dark) {
    Window window = getWindow();
    int background = Color.parseColor(dark ? "#0E1713" : "#F4F6F4");
    window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(background));
    window.getDecorView().setBackgroundColor(background);
    getBridge().getWebView().setBackgroundColor(background);
    window.setStatusBarColor(background);
    window.setNavigationBarColor(background);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    View decor = window.getDecorView();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = decor.getWindowInsetsController();
      if (controller != null) {
        int appearance = dark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
          | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        controller.setSystemBarsAppearance(
          appearance,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
      return;
    }
    int flags = decor.getSystemUiVisibility();
    flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(flags);
  }

  private void showLaunchOverlay() {
    FrameLayout overlay = new FrameLayout(this);
    overlay.setBackgroundColor(Color.parseColor("#111B21"));
    overlay.setClickable(true);

    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.vault_nest_splash_logo);
    icon.setScaleType(ImageView.ScaleType.FIT_CENTER);

    FrameLayout.LayoutParams iconLayout = new FrameLayout.LayoutParams(dp(148), dp(148));
    iconLayout.gravity = Gravity.CENTER;
    overlay.addView(icon, iconLayout);
    addContentView(
      overlay,
      new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    );
    launchOverlay = overlay;
    launchOverlayShownAt = System.currentTimeMillis();
  }

  private void hideLaunchOverlay() {
    View overlay = launchOverlay;
    if (overlay == null) return;
    long remainingMs = Math.max(0L, 1100L - (System.currentTimeMillis() - launchOverlayShownAt));
    if (remainingMs > 0L) {
      mainHandler.postDelayed(() -> hideLaunchOverlay(), remainingMs);
      return;
    }
    launchOverlay = null;
    overlay.animate()
      .alpha(0f)
      .setDuration(180)
      .withEndAction(() -> {
        if (overlay.getParent() instanceof ViewGroup) {
          ((ViewGroup) overlay.getParent()).removeView(overlay);
        }
        applySystemBars(darkMode);
      })
      .start();
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  @SuppressWarnings("deprecation")
  private void applyLaunchBarStyle() {
    Window window = getWindow();
    int background = Color.parseColor("#111B21");
    window.getDecorView().setBackgroundColor(background);
    window.setStatusBarColor(background);
    window.setNavigationBarColor(background);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    View decor = window.getDecorView();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = decor.getWindowInsetsController();
      if (controller != null) {
        controller.setSystemBarsAppearance(
          0,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
      return;
    }
    int flags = decor.getSystemUiVisibility();
    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(flags);
  }

  public class VaultNestNativeBridge {
    @JavascriptInterface
    public void hideSplash() {
      runOnUiThread(() -> hideLaunchOverlay());
    }

    @JavascriptInterface
    public void setScreenshotProtection(boolean enabled) {
      runOnUiThread(() -> {
        if (enabled) {
          getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } else {
          getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
      });
    }

    @JavascriptInterface
    public void scheduleClipboardClear(long delayMs) {
      if (clipboardClearTask != null) mainHandler.removeCallbacks(clipboardClearTask);
      clipboardClearTask = () -> {
        try {
          ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
          if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("", ""));
        } catch (Exception ignored) { }
        clipboardClearTask = null;
      };
      mainHandler.postDelayed(clipboardClearTask, Math.max(0L, delayMs));
    }

    @JavascriptInterface
    public void fetchWebsiteIcon(String websiteUrl, String requestId) {
      new Thread(() -> {
        JSONObject result = new JSONObject();
        try {
          result.put("requestId", requestId == null ? "" : requestId);
          result.put("dataUrl", fetchWebsiteArtwork(websiteUrl));
          dispatchNativeResult("website-icon", true, result.toString(), "");
        } catch (Exception error) {
          try {
            result.put("requestId", requestId == null ? "" : requestId);
            result.put("dataUrl", "");
          } catch (Exception ignored) { }
          dispatchNativeResult("website-icon", false, result.toString(), error.getMessage());
        }
      }, "vault-nest-website-icon").start();
    }

    @JavascriptInterface
    public void showCredentialCopyNotifications(String jsonPayload, long expiresAt, boolean dark) {
      try {
        ensureCredentialNotificationChannel();
        JSONArray fields = new JSONArray(jsonPayload);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        List<Integer> ids = new ArrayList<>();
        for (int index = 0; index < fields.length(); index++) {
          JSONObject field = fields.getJSONObject(index);
          int id = field.getInt("id");
          String label = field.getString("label");
          String itemTitle = field.getString("itemTitle");
          String value = field.getString("value");
          ids.add(id);
          CredentialShortcutStore.put(MainActivity.this, id, label, value, expiresAt);
          Intent intent = new Intent(MainActivity.this, CredentialCopyActivity.class)
            .setAction(CredentialCopyActivity.ACTION_COPY)
            .setData(Uri.parse("vaultnest://credential-copy/" + id))
            .putExtra(CredentialCopyActivity.EXTRA_COPY_ID, id)
            .addFlags(
              Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_NO_ANIMATION
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            );
          PendingIntent pendingIntent = PendingIntent.getActivity(
            MainActivity.this,
            id,
            intent,
            PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
          );
          Notification.Action copyAction = new Notification.Action.Builder(
            R.drawable.ic_stat_vault_nest,
            "Copy",
            pendingIntent
          ).build();
          Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(MainActivity.this, CREDENTIAL_CHANNEL_ID)
            : new Notification.Builder(MainActivity.this);
          Notification notification = builder
            .setSmallIcon(R.drawable.ic_stat_vault_nest)
            .setContentTitle(label + " - " + itemTitle)
            .setContentText("Touch to copy to clipboard.")
            .setContentIntent(pendingIntent)
            .setAutoCancel(false)
            .setOngoing(false)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setColor(Color.parseColor(dark ? "#BFEA78" : "#3E6B19"))
            .addAction(copyAction)
            .build();
          manager.notify(id, notification);
        }
        StringBuilder csvIds = new StringBuilder();
        for (int index = 0; index < ids.size(); index++) {
          if (index > 0) csvIds.append(",");
          csvIds.append(ids.get(index));
        }
        cancelCredentialNotifications(csvIds.toString(), Math.max(0L, expiresAt - System.currentTimeMillis()));
      } catch (Exception error) {
        dispatchNativeResult("credential-notifications", false, "", error.getMessage());
      }
    }

    @JavascriptInterface
    public void cancelCredentialNotifications(String csvIds, long delayMs) {
      if (notificationCleanupTask != null) mainHandler.removeCallbacks(notificationCleanupTask);
      notificationCleanupTask = () -> {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && csvIds != null && !csvIds.isEmpty()) {
          for (String rawId : csvIds.split(",")) {
            try {
              int id = Integer.parseInt(rawId.trim());
              CredentialShortcutStore.clear(MainActivity.this, id);
              manager.cancel(id);
            } catch (Exception ignored) { }
          }
        }
        notificationCleanupTask = null;
      };
      mainHandler.postDelayed(notificationCleanupTask, Math.max(0L, delayMs));
    }

    @JavascriptInterface
    public void setVaultUnlocked(boolean unlocked) {
      vaultUnlocked = unlocked;
    }

    @JavascriptInterface
    public boolean isBiometricAvailable() {
      return BiometricManager.from(MainActivity.this).canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
      ) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @JavascriptInterface
    public void enableBiometric(String base64VaultKey) {
      runOnUiThread(() -> {
        try {
          byte[] rawVaultKey = Base64.decode(base64VaultKey, Base64.DEFAULT);
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.ENCRYPT_MODE, createBiometricKey());
          showBiometricPrompt("Enable biometric unlock", cipher, () -> {
            try {
              byte[] encrypted = cipher.doFinal(rawVaultKey);
              preferences().edit()
                .putString("wrapped_key", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("wrapped_iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
              java.util.Arrays.fill(rawVaultKey, (byte) 0);
              dispatchNativeResult("biometric-enabled", true, "", "");
            } catch (Exception error) {
              dispatchNativeResult("biometric-enabled", false, "", error.getMessage());
            }
          }, "biometric-enabled");
        } catch (Exception error) {
          dispatchNativeResult("biometric-enabled", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void authenticateBiometric() {
      runOnUiThread(() -> {
        try {
          String wrapped = preferences().getString("wrapped_key", null);
          String iv = preferences().getString("wrapped_iv", null);
          if (wrapped == null || iv == null) throw new IllegalStateException("Biometric unlock is not configured on this device.");
          KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
          keyStore.load(null);
          SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
          if (key == null) throw new IllegalStateException("The biometric device key is unavailable. Enable biometrics again.");
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(iv, Base64.DEFAULT)));
          showBiometricPrompt("Unlock Vault Nest", cipher, () -> {
            try {
              byte[] raw = cipher.doFinal(Base64.decode(wrapped, Base64.DEFAULT));
              String data = Base64.encodeToString(raw, Base64.NO_WRAP);
              java.util.Arrays.fill(raw, (byte) 0);
              dispatchNativeResult("biometric-unlock", true, data, "");
            } catch (Exception error) {
              dispatchNativeResult("biometric-unlock", false, "", error.getMessage());
            }
          }, "biometric-unlock");
        } catch (Exception error) {
          dispatchNativeResult("biometric-unlock", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void disableBiometric() {
      try {
        preferences().edit().clear().apply();
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
      } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void storeIntrusionEvidence(long timestamp, String base64Jpeg) {
      byte[] plaintext = null;
      try {
        plaintext = Base64.decode(base64Jpeg, Base64.DEFAULT);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEvidenceKey());
        byte[] ciphertext = cipher.doFinal(plaintext);
        File outputFile = new File(evidenceDirectory(), "evidence_" + timestamp + ".bin");
        try (DataOutputStream output = new DataOutputStream(new FileOutputStream(outputFile))) {
          byte[] iv = cipher.getIV();
          output.writeInt(iv.length);
          output.write(iv);
          output.write(ciphertext);
        }
        Arrays.fill(ciphertext, (byte) 0);
      } catch (Exception ignored) {
      } finally {
        if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
      }
    }

    @JavascriptInterface
    public String listIntrusionEvidence() {
      JSONArray result = new JSONArray();
      if (!vaultUnlocked) return result.toString();
      File[] files = evidenceDirectory().listFiles((directory, name) -> name.matches("evidence_[0-9]+\\\\.bin"));
      if (files == null) return result.toString();
      Arrays.sort(files, Comparator.comparing(File::getName).reversed());
      for (File file : files) {
        try {
          String timestamp = file.getName().substring(9, file.getName().length() - 4);
          JSONObject entry = new JSONObject();
          entry.put("id", file.getName());
          java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US);
          entry.put("capturedAt", format.format(new java.util.Date(Long.parseLong(timestamp))));
          result.put(entry);
        } catch (Exception ignored) { }
      }
      return result.toString();
    }

    @JavascriptInterface
    public String readIntrusionEvidence(String id) {
      if (!vaultUnlocked) return "";
      if (id == null || !id.matches("evidence_[0-9]+\\\\.bin")) return "";
      try (DataInputStream input = new DataInputStream(new FileInputStream(new File(evidenceDirectory(), id)))) {
        int ivLength = input.readInt();
        if (ivLength != 12) return "";
        byte[] iv = new byte[ivLength];
        input.readFully(iv);
        byte[] ciphertext = new byte[input.available()];
        input.readFully(ciphertext);
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey key = (SecretKey) keyStore.getKey(EVIDENCE_KEY_ALIAS, null);
        if (key == null) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] plaintext = cipher.doFinal(ciphertext);
        String data = Base64.encodeToString(plaintext, Base64.NO_WRAP);
        Arrays.fill(plaintext, (byte) 0);
        Arrays.fill(ciphertext, (byte) 0);
        return data;
      } catch (Exception ignored) {
        return "";
      }
    }

    @JavascriptInterface
    public void deleteIntrusionEvidence(String id) {
      if (!vaultUnlocked) return;
      if (id != null && id.matches("evidence_[0-9]+\\\\.bin")) new File(evidenceDirectory(), id).delete();
    }

    @JavascriptInterface
    public void deleteAllIntrusionEvidence() {
      File[] files = evidenceDirectory().listFiles();
      if (files != null) for (File file : files) file.delete();
      try {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(EVIDENCE_KEY_ALIAS)) keyStore.deleteEntry(EVIDENCE_KEY_ALIAS);
      } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void saveIntrusionEvidence(String id, String fileName) {
      runOnUiThread(() -> {
        try {
          if (!vaultUnlocked) throw new IllegalStateException("Unlock the vault before exporting evidence.");
          String base64 = readIntrusionEvidence(id);
          if (base64.isEmpty()) throw new IllegalStateException("The intrusion photo could not be decrypted.");
          pendingBackup = Base64.decode(base64, Base64.DEFAULT);
          Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("image/jpeg");
          intent.putExtra(Intent.EXTRA_TITLE, fileName);
          startActivityForResult(intent, SAVE_EVIDENCE_REQUEST);
        } catch (Exception error) {
          dispatchNativeResult("evidence-saved", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void saveBackup(String fileName, String base64Data) {
      runOnUiThread(() -> {
        try {
          pendingBackup = Base64.decode(base64Data, Base64.DEFAULT);
          Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("application/octet-stream");
          intent.putExtra(Intent.EXTRA_TITLE, fileName);
          startActivityForResult(intent, CREATE_BACKUP_REQUEST);
        } catch (Exception error) {
          dispatchNativeResult("backup-saved", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void openBackup() {
      runOnUiThread(() -> {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, OPEN_BACKUP_REQUEST);
      });
    }
  }

  private void ensureCredentialNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null || manager.getNotificationChannel(CREDENTIAL_CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(
      CREDENTIAL_CHANNEL_ID,
      "Credential copy shortcuts",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Temporary shortcuts for copying selected credential fields");
    channel.setShowBadge(false);
    channel.enableLights(false);
    channel.enableVibration(false);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
    manager.createNotificationChannel(channel);
  }

  private String fetchWebsiteArtwork(String rawWebsiteUrl) throws Exception {
    if (rawWebsiteUrl == null || rawWebsiteUrl.trim().isEmpty()) {
      throw new IllegalArgumentException("Website URL is empty");
    }
    String normalised = rawWebsiteUrl.trim();
    if (!normalised.matches("(?i)^https?://.*")) normalised = "https://" + normalised;
    URL website = new URL(normalised);
    if (!"http".equalsIgnoreCase(website.getProtocol()) && !"https".equalsIgnoreCase(website.getProtocol())) {
      throw new IllegalArgumentException("Only HTTP and HTTPS websites are supported");
    }

    HttpURLConnection pageConnection = openConnection(website);
    pageConnection.setRequestProperty(
      "Accept",
      "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
    );
    String html;
    URL resolvedPage;
    try {
      int status = pageConnection.getResponseCode();
      if (status < 200 || status >= 400) {
        throw new IllegalStateException("Website returned HTTP " + status);
      }
      resolvedPage = pageConnection.getURL();
      try (InputStream input = pageConnection.getInputStream()) {
        html = new String(readLimited(input, 1_048_576), StandardCharsets.UTF_8);
      }
    } finally {
      pageConnection.disconnect();
    }

    Exception lastError = null;
    for (String artworkUrl : artworkCandidates(html, resolvedPage)) {
      try {
        return downloadReducedArtwork(new URL(artworkUrl));
      } catch (Exception error) {
        lastError = error;
      }
    }
    throw lastError == null
      ? new IllegalStateException("No website image was found")
      : lastError;
  }

  private HttpURLConnection openConnection(URL url) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(20_000);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty(
      "User-Agent",
      "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 VaultNest/1.0"
    );
    return connection;
  }

  private List<String> artworkCandidates(String html, URL pageUrl) {
    LinkedHashSet<String> openGraph = new LinkedHashSet<>();
    LinkedHashSet<String> icons = new LinkedHashSet<>();
    Pattern tagPattern = Pattern.compile("<(?:meta|link)\\\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    Pattern attributePattern = Pattern.compile(
      "([A-Za-z_:][A-Za-z0-9_:.-]*)\\\\s*=\\\\s*([\\\"'])(.*?)\\\\2",
      Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    Matcher tags = tagPattern.matcher(html);
    while (tags.find()) {
      String tag = tags.group();
      Map<String, String> attributes = new HashMap<>();
      Matcher attribute = attributePattern.matcher(tag);
      while (attribute.find()) {
        attributes.put(
          attribute.group(1).toLowerCase(java.util.Locale.ROOT),
          attribute.group(3).trim()
        );
      }
      String property = attributes.get("property");
      if (property == null) property = attributes.get("name");
      String content = attributes.get("content");
      if (
        property != null
          && content != null
          && (
            "og:image".equalsIgnoreCase(property)
              || "og:image:url".equalsIgnoreCase(property)
              || "twitter:image".equalsIgnoreCase(property)
          )
      ) {
        addResolvedUrl(openGraph, pageUrl, content);
      }
      String rel = attributes.get("rel");
      String href = attributes.get("href");
      if (rel != null && href != null && rel.toLowerCase(java.util.Locale.ROOT).contains("icon")) {
        addResolvedUrl(icons, pageUrl, href);
      }
    }
    openGraph.addAll(icons);
    addResolvedUrl(openGraph, pageUrl, "/favicon.ico");
    return new ArrayList<>(openGraph);
  }

  private void addResolvedUrl(LinkedHashSet<String> target, URL pageUrl, String candidate) {
    try {
      String decoded = candidate.replace("&amp;", "&").replace("&#38;", "&");
      URL resolved = new URL(pageUrl, decoded);
      if ("http".equalsIgnoreCase(resolved.getProtocol()) || "https".equalsIgnoreCase(resolved.getProtocol())) {
        target.add(resolved.toString());
      }
    } catch (Exception ignored) { }
  }

  private String downloadReducedArtwork(URL artworkUrl) throws Exception {
    HttpURLConnection connection = openConnection(artworkUrl);
    connection.setRequestProperty("Accept", "image/*");
    byte[] bytes;
    try {
      int status = connection.getResponseCode();
      if (status < 200 || status >= 400) {
        throw new IllegalStateException("Image returned HTTP " + status);
      }
      try (InputStream input = connection.getInputStream()) {
        bytes = readLimited(input, 4_194_304);
      }
    } finally {
      connection.disconnect();
    }
    Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    if (source == null) throw new IllegalStateException("Website image format is unsupported");
    int largest = Math.max(source.getWidth(), source.getHeight());
    float scale = largest > 192 ? 192f / largest : 1f;
    int width = Math.max(1, Math.round(source.getWidth() * scale));
    int height = Math.max(1, Math.round(source.getHeight() * scale));
    Bitmap reduced = scale < 1f
      ? Bitmap.createScaledBitmap(source, width, height, true)
      : source;
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    boolean hasAlpha = reduced.hasAlpha();
    Bitmap.CompressFormat format;
    String mimeType;
    if (hasAlpha) {
      format = Bitmap.CompressFormat.PNG;
      mimeType = "image/png";
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      format = Bitmap.CompressFormat.WEBP_LOSSY;
      mimeType = "image/webp";
    } else {
      format = Bitmap.CompressFormat.JPEG;
      mimeType = "image/jpeg";
    }
    if (!reduced.compress(format, hasAlpha ? 100 : 82, output)) {
      throw new IllegalStateException("Website image could not be reduced");
    }
    if (reduced != source) reduced.recycle();
    source.recycle();
    return "data:" + mimeType + ";base64,"
      + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
  }

  private byte[] readLimited(InputStream input, int maximumBytes) throws Exception {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int total = 0;
    int count;
    while ((count = input.read(buffer)) != -1) {
      total += count;
      if (total > maximumBytes) throw new IllegalStateException("Downloaded content is too large");
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private SecretKey createBiometricKey() throws Exception {
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
    } else {
      builder.setUserAuthenticationValidityDurationSeconds(-1);
    }
    generator.init(builder.build());
    return generator.generateKey();
  }

  private SecretKey getOrCreateEvidenceKey() throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    SecretKey existing = (SecretKey) keyStore.getKey(EVIDENCE_KEY_ALIAS, null);
    if (existing != null) return existing;
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(
      EVIDENCE_KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
      .build());
    return generator.generateKey();
  }

  private File evidenceDirectory() {
    File directory = new File(getFilesDir(), "intrusion-evidence");
    if (!directory.exists()) directory.mkdirs();
    return directory;
  }

  private void showBiometricPrompt(String title, Cipher cipher, Runnable success, String action) {
    Executor executor = ContextCompat.getMainExecutor(this);
    BiometricPrompt prompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
      @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { success.run(); }
      @Override public void onAuthenticationError(int code, CharSequence message) {
        dispatchNativeResult(action, false, "", message.toString());
      }
      @Override public void onAuthenticationFailed() { }
    });
    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setSubtitle("Confirm your identity on this device")
      .setNegativeButtonText("Cancel")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build();
    prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
  }

  private SharedPreferences preferences() {
    return getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != CREATE_BACKUP_REQUEST && requestCode != OPEN_BACKUP_REQUEST && requestCode != SAVE_EVIDENCE_REQUEST) return;
    String action = requestCode == CREATE_BACKUP_REQUEST ? "backup-saved" : requestCode == OPEN_BACKUP_REQUEST ? "backup-opened" : "evidence-saved";
    if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
      pendingBackup = null;
      dispatchNativeResult(action, false, "", "File selection was cancelled.");
      return;
    }
    Uri uri = data.getData();
    try {
      if (requestCode == CREATE_BACKUP_REQUEST || requestCode == SAVE_EVIDENCE_REQUEST) {
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
          if (output == null) throw new IllegalStateException("The selected file could not be opened.");
          output.write(pendingBackup);
        }
        pendingBackup = null;
        dispatchNativeResult(action, true, "", "");
        return;
      }
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      try (InputStream input = getContentResolver().openInputStream(uri)) {
        if (input == null) throw new IllegalStateException("The selected file could not be opened.");
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
      }
      dispatchNativeResult(action, true, Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP), "");
    } catch (Exception error) {
      pendingBackup = null;
      dispatchNativeResult(action, false, "", error.getMessage());
    }
  }

  private void dispatchNativeResult(String action, boolean success, String data, String message) {
    runOnUiThread(() -> {
      String script = "window.dispatchEvent(new CustomEvent('vault-nest-native-result',{detail:{"
        + "action:" + JSONObject.quote(action) + ","
        + "success:" + success + ","
        + "data:" + JSONObject.quote(data == null ? "" : data) + ","
        + "message:" + JSONObject.quote(message == null ? "" : message)
        + "}}));";
      getBridge().getWebView().evaluateJavascript(script, null);
    });
  }
}
`;

await writeFile(activityPath, source, 'utf8');

await writeFile(
  credentialCopyActivityPath,
  `package ${appId};

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.widget.Toast;

public class CredentialCopyActivity extends Activity {
  public static final String ACTION_COPY = "${appId}.COPY_CREDENTIAL";
  public static final String EXTRA_COPY_ID = "copy_id";
  private static final long CLIPBOARD_CLEAR_MS = 5L * 60L * 1000L;
  private static final Handler HANDLER = new Handler(Looper.getMainLooper());
  private static Runnable clipboardClearTask;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent intent = getIntent();
    if (intent == null || !ACTION_COPY.equals(intent.getAction())) {
      finishWithoutAnimation();
      return;
    }
    int id = intent.getIntExtra(EXTRA_COPY_ID, -1);
    CredentialShortcutStore.Shortcut shortcut = id < 0
      ? null
      : CredentialShortcutStore.get(this, id);
    if (shortcut == null) {
      cancelNotification(id);
      Toast.makeText(this, "Credential shortcut expired", Toast.LENGTH_SHORT).show();
      finishWithoutAnimation();
      return;
    }
    try {
      ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      if (clipboard == null) throw new IllegalStateException("Clipboard unavailable");
      ClipData clip = ClipData.newPlainText(shortcut.label, shortcut.value);
      PersistableBundle extras = new PersistableBundle();
      extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);
      clip.getDescription().setExtras(extras);
      clipboard.setPrimaryClip(clip);
      scheduleClipboardClear(getApplicationContext());
      Toast.makeText(this, shortcut.label + " copied", Toast.LENGTH_SHORT).show();
    } catch (Exception error) {
      Toast.makeText(this, "Credential could not be copied", Toast.LENGTH_SHORT).show();
    }
    finishWithoutAnimation();
  }

  private void cancelNotification(int id) {
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(id);
  }

  private void finishWithoutAnimation() {
    finishAndRemoveTask();
    overridePendingTransition(0, 0);
  }

  private static void scheduleClipboardClear(Context context) {
    if (clipboardClearTask != null) HANDLER.removeCallbacks(clipboardClearTask);
    clipboardClearTask = () -> {
      try {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("", ""));
      } catch (Exception ignored) { }
      clipboardClearTask = null;
    };
    HANDLER.postDelayed(clipboardClearTask, CLIPBOARD_CLEAR_MS);
  }
}
`,
  'utf8',
);

await writeFile(
  credentialShortcutStorePath,
  `package ${appId};

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class CredentialShortcutStore {
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "vault_nest_credential_shortcut_key";
  private static final String PREFERENCES = "vault_nest_credential_shortcuts";

  private CredentialShortcutStore() { }

  static void put(
    Context context,
    int id,
    String label,
    String value,
    long expiresAt
  ) throws Exception {
    JSONObject payload = new JSONObject()
      .put("label", label)
      .put("value", value)
      .put("expiresAt", expiresAt);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    byte[] encrypted = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
    byte[] iv = cipher.getIV();
    ByteBuffer envelope = ByteBuffer.allocate(1 + iv.length + encrypted.length);
    envelope.put((byte) iv.length);
    envelope.put(iv);
    envelope.put(encrypted);
    boolean saved = preferences(context)
      .edit()
      .putString(String.valueOf(id), Base64.encodeToString(envelope.array(), Base64.NO_WRAP))
      .commit();
    if (!saved) throw new IllegalStateException("Credential shortcut could not be stored");
  }

  static Shortcut get(Context context, int id) {
    String encoded = preferences(context).getString(String.valueOf(id), null);
    if (encoded == null) return null;
    try {
      ByteBuffer envelope = ByteBuffer.wrap(Base64.decode(encoded, Base64.DEFAULT));
      int ivLength = envelope.get() & 0xff;
      if (ivLength < 12 || ivLength > 16 || envelope.remaining() <= ivLength) {
        throw new IllegalStateException("Invalid credential shortcut envelope");
      }
      byte[] iv = new byte[ivLength];
      envelope.get(iv);
      byte[] encrypted = new byte[envelope.remaining()];
      envelope.get(encrypted);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
      JSONObject payload = new JSONObject(
        new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
      );
      long expiresAt = payload.getLong("expiresAt");
      if (System.currentTimeMillis() >= expiresAt) {
        clear(context, id);
        return null;
      }
      return new Shortcut(payload.getString("label"), payload.getString("value"));
    } catch (Exception error) {
      clear(context, id);
      return null;
    }
  }

  static void clear(Context context, int id) {
    preferences(context).edit().remove(String.valueOf(id)).apply();
  }

  private static SharedPreferences preferences(Context context) {
    return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
  }

  private static SecretKey key() throws Exception {
    KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
    keyStore.load(null);
    java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
    if (existing instanceof SecretKey) return (SecretKey) existing;
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
    generator.init(
      new KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    );
    return generator.generateKey();
  }

  static final class Shortcut {
    final String label;
    final String value;

    Shortcut(String label, String value) {
      this.label = label;
      this.value = value;
    }
  }
}
`,
  'utf8',
);

try {
  for (const directory of await readdir(resPath)) {
    if (!directory.startsWith('drawable')) continue;
    const splashPng = resolve(resPath, directory, 'splash.png');
    const splashXml = resolve(resPath, directory, 'splash.xml');
    if (await fileExists(splashPng)) await rm(splashPng);
    if (directory !== 'drawable' && (await fileExists(splashXml))) await rm(splashXml);
  }
} catch {
  // Resource directories are generated by Capacitor; missing folders are harmless here.
}

if (!(await fileExists(splashLogoPath)) && (await fileExists(splashLogoSourcePath))) {
  await mkdir(dirname(splashLogoPath), { recursive: true });
  await copyFile(splashLogoSourcePath, splashLogoPath);
}

await mkdir(dirname(splashIconPath), { recursive: true });
await writeFile(
  splashIconPath,
  `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/vault_nest_splash_logo"
    android:inset="18%" />
`,
  'utf8',
);

await writeFile(
  splashPath,
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#111B21" />
        </shape>
    </item>
    <item
        android:drawable="@drawable/vault_nest_splash_icon"
        android:gravity="center" />
</layer-list>
`,
  'utf8',
);

const stylesPath = resolve(resPath, 'values/styles.xml');
if (await fileExists(stylesPath)) {
  let styles = await readFile(stylesPath, 'utf8');
  const systemBarItems = `        <item name="android:statusBarColor">#F4F6F4</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:navigationBarColor">#F4F6F4</item>
        <item name="android:windowLightNavigationBar">true</item>`;
  if (!styles.includes('android:windowLightStatusBar')) {
    styles = styles.replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/,
      (_match, open, body, close) => `${open}${body}${systemBarItems}\n    ${close}`,
    );
  }
  const launchTheme = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#111B21</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/vault_nest_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:background">@drawable/splash</item>
        <item name="android:statusBarColor">#111B21</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:navigationBarColor">#111B21</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>`;
  styles = styles.replace(
    /\s*<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
    `\n\n${launchTheme}`,
  );
  const credentialCopyTheme = `    <style name="VaultNest.CredentialCopy" parent="@android:style/Theme.Translucent.NoTitleBar">
        <item name="android:windowNoDisplay">true</item>
        <item name="android:windowDisablePreview">true</item>
        <item name="android:windowIsTranslucent">true</item>
        <item name="android:windowIsFloating">true</item>
        <item name="android:backgroundDimEnabled">false</item>
    </style>`;
  if (!styles.includes('name="VaultNest.CredentialCopy"')) {
    styles = styles.replace('</resources>', `\n${credentialCopyTheme}\n</resources>`);
  }
  await writeFile(stylesPath, styles, 'utf8');
}

const nightStylesPath = resolve(resPath, 'values-night/styles.xml');
await mkdir(dirname(nightStylesPath), { recursive: true });
await writeFile(
  nightStylesPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:statusBarColor">#0E1713</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:navigationBarColor">#0E1713</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
</resources>
`,
  'utf8',
);

const v31StylesPath = resolve(resPath, 'values-v31/styles.xml');
await mkdir(dirname(v31StylesPath), { recursive: true });
await writeFile(
  v31StylesPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#111B21</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/vault_nest_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:statusBarColor">#111B21</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:navigationBarColor">#111B21</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
</resources>
`,
  'utf8',
);

console.log(
  'Applied Vault Nest Android backup, biometric, splash, screenshot, system-bar, and notification-icon patches.',
);
