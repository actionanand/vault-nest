import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const activityPath = resolve('android/app/src/main/java/app/vaultnest/mobile/MainActivity.java');
const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const gradlePath = resolve('android/app/build.gradle');
const notificationIconPath = resolve('android/app/src/main/res/drawable/ic_stat_vault_nest.xml');

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

const source = `package app.vaultnest.mobile;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;

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
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.Executor;

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
  private byte[] pendingBackup;
  private volatile boolean vaultUnlocked = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getBridge().getWebView().addJavascriptInterface(new VaultNestNativeBridge(), "VaultNestNative");
    getBridge().getWebView().addJavascriptInterface(new SystemBarsBridge(), "VaultNestSystemBars");
    boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
      == Configuration.UI_MODE_NIGHT_YES;
    applySystemBars(dark);
  }

  public class SystemBarsBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) {
      runOnUiThread(() -> applySystemBars(enabled));
    }
  }

  private void applySystemBars(boolean dark) {
    int background = Color.parseColor(dark ? "#0E1713" : "#F4F6F4");
    getWindow().setStatusBarColor(background);
    getWindow().setNavigationBarColor(background);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      int flags = getWindow().getDecorView().getSystemUiVisibility();
      flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      }
      getWindow().getDecorView().setSystemUiVisibility(flags);
    }
  }

  public class VaultNestNativeBridge {
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
console.log(
  'Applied Vault Nest Android backup, biometric, system-bar, and notification-icon patches.',
);
