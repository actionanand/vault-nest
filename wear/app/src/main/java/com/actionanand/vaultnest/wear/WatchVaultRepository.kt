package com.actionanand.vaultnest.wear

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PublicKey
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class WatchEntry(
    val id: String,
    val title: String,
    val username: String,
    val password: String,
    val updatedAt: String,
)

data class PinResult(val success: Boolean, val waitMillis: Long = 0)

class WatchVaultRepository(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val vaultFile = File(context.filesDir, "watch-vault-v1.enc")

    @Synchronized
    fun entries(): List<WatchEntry> {
        if (!vaultFile.exists()) return emptyList()
        val plaintext = decryptAtRest(vaultFile.readBytes(), "watch-vault-records-v1")
        return WatchEntryCodec.decode(String(plaintext, StandardCharsets.UTF_8))
    }

    @Synchronized
    fun replace(entries: List<WatchEntry>) {
        WatchPayloadValidator.validate(WatchProtocol.VERSION, entries, BuildConfig.WATCH_VAULT_MAX_ENTRIES)
        val temporary = File(context.filesDir, "watch-vault-v1.tmp")
        temporary.writeBytes(encryptAtRest(WatchEntryCodec.encode(entries).toByteArray(StandardCharsets.UTF_8), "watch-vault-records-v1"))
        check(temporary.renameTo(vaultFile) || temporary.copyTo(vaultFile, overwrite = true).let { temporary.delete(); true })
    }

    @Synchronized
    fun clearEntries() {
        if (vaultFile.exists()) vaultFile.delete()
    }

    fun hasPin(): Boolean = preferences.contains(PIN_HASH)

    fun setupPin(pin: String) {
        require(pin.matches(Regex("\\d{4,6}"))) { "PIN must contain 4 to 6 digits" }
        val salt = ByteArray(16).also(RANDOM::nextBytes)
        val hash = PinHasher.hash(pin.toCharArray(), salt)
        preferences.edit()
            .putString(PIN_SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
            .putString(PIN_HASH, Base64.encodeToString(hash, Base64.NO_WRAP))
            .putInt(PIN_FAILURES, 0)
            .remove(PIN_LOCK_UNTIL)
            .apply()
    }

    fun verifyPin(pin: String): PinResult {
        val now = System.currentTimeMillis()
        val lockUntil = preferences.getLong(PIN_LOCK_UNTIL, 0)
        if (lockUntil > now) return PinResult(false, lockUntil - now)
        val salt = preferences.getString(PIN_SALT, null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: return PinResult(false)
        val expected = preferences.getString(PIN_HASH, null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: return PinResult(false)
        if (PinHasher.matches(pin.toCharArray(), salt, expected)) {
            preferences.edit().putInt(PIN_FAILURES, 0).remove(PIN_LOCK_UNTIL).apply()
            return PinResult(true)
        }
        val failures = preferences.getInt(PIN_FAILURES, 0) + 1
        val delay = if (failures >= 5) {
            val level = ((failures - 5) / 3).coerceAtMost(7)
            (30_000L * (1L shl level)).coerceAtMost(3_600_000L)
        } else 0L
        preferences.edit().putInt(PIN_FAILURES, failures).apply {
            if (delay > 0) putLong(PIN_LOCK_UNTIL, now + delay)
        }.apply()
        return PinResult(false, delay)
    }

    fun resetAll() {
        clearEntries()
        preferences.edit().clear().apply()
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        listOf(AT_REST_ALIAS, PAIR_WRAP_ALIAS).forEach { alias ->
            if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        }
    }

    fun storePhonePublicKey(nodeId: String, encoded: ByteArray) {
        val key = java.security.KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(encoded))
        preferences.edit().putString("$PHONE_KEY_PREFIX$nodeId", Base64.encodeToString(key.encoded, Base64.NO_WRAP)).apply()
    }

    fun ownTransportKeyPair(): KeyPair {
        val publicValue = preferences.getString(PAIR_PUBLIC, null)
        val privateValue = preferences.getString(PAIR_PRIVATE, null)
        if (publicValue != null && privateValue != null) {
            val factory = java.security.KeyFactory.getInstance("EC")
            val publicKey = factory.generatePublic(X509EncodedKeySpec(Base64.decode(publicValue, Base64.NO_WRAP)))
            val privateBytes = decryptWithKey(
                Base64.decode(privateValue, Base64.NO_WRAP),
                key(PAIR_WRAP_ALIAS),
                "watch-pair-private-v1",
            )
            val privateKey = factory.generatePrivate(PKCS8EncodedKeySpec(privateBytes))
            return KeyPair(publicKey, privateKey)
        }
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"), RANDOM)
        val pair = generator.generateKeyPair()
        preferences.edit()
            .putString(PAIR_PUBLIC, Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP))
            .putString(
                PAIR_PRIVATE,
                Base64.encodeToString(
                    encryptWithKey(pair.private.encoded, key(PAIR_WRAP_ALIAS), "watch-pair-private-v1"),
                    Base64.NO_WRAP,
                ),
            )
            .apply()
        return pair
    }

    fun phonePublicKey(nodeId: String): PublicKey? = runCatching {
        val encoded = preferences.getString("$PHONE_KEY_PREFIX$nodeId", null) ?: return null
        java.security.KeyFactory.getInstance("EC").generatePublic(
            X509EncodedKeySpec(Base64.decode(encoded, Base64.NO_WRAP)),
        )
    }.getOrNull()

    fun decryptTransport(path: String, nodeId: String, envelopeBytes: ByteArray): ByteArray {
        val peer = phonePublicKey(nodeId) ?: error("Untrusted phone")
        val own = ownTransportKeyPair()
        val envelope = JSONObject(String(envelopeBytes, StandardCharsets.UTF_8))
        require(envelope.getInt("version") == WatchProtocol.VERSION) { "Unsupported protocol" }
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(own.private)
        agreement.doPhase(peer, true)
        val derived = deriveTransportKey(agreement.generateSecret(), own.public.encoded, peer.encoded)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(derived, "AES"),
            GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)),
        )
        cipher.updateAAD("$path:${WatchProtocol.VERSION}".toByteArray(StandardCharsets.UTF_8))
        return cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP))
    }

    private fun encryptAtRest(plaintext: ByteArray, aad: String): ByteArray =
        encryptWithKey(plaintext, key(AT_REST_ALIAS), aad)

    private fun decryptAtRest(envelope: ByteArray, aad: String): ByteArray =
        decryptWithKey(envelope, key(AT_REST_ALIAS), aad)

    private fun encryptWithKey(plaintext: ByteArray, key: SecretKey, aad: String): ByteArray {
        val iv = ByteArray(12).also(RANDOM::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
        cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
        return JSONObject()
            .put("version", 1)
            .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP))
            .toString().toByteArray(StandardCharsets.UTF_8)
    }

    private fun decryptWithKey(envelopeBytes: ByteArray, key: SecretKey, aad: String): ByteArray {
        val envelope = JSONObject(String(envelopeBytes, StandardCharsets.UTF_8))
        require(envelope.getInt("version") == 1) { "Unsupported encrypted record" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)),
        )
        cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
        return cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP))
    }

    private fun key(alias: String): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun deriveTransportKey(secret: ByteArray, first: ByteArray, second: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update("vault-nest-watch-transport-v1".toByteArray(StandardCharsets.UTF_8))
        digest.update(secret)
        if (compare(first, second) <= 0) { digest.update(first); digest.update(second) }
        else { digest.update(second); digest.update(first) }
        return digest.digest()
    }

    private fun compare(first: ByteArray, second: ByteArray): Int {
        for (index in 0 until minOf(first.size, second.size)) {
            val comparison = (first[index].toInt() and 0xff).compareTo(second[index].toInt() and 0xff)
            if (comparison != 0) return comparison
        }
        return first.size.compareTo(second.size)
    }

    companion object {
        private const val PREFERENCES = "vault_nest_wear_v1"
        private const val PIN_SALT = "pin_salt"
        private const val PIN_HASH = "pin_hash"
        private const val PIN_FAILURES = "pin_failures"
        private const val PIN_LOCK_UNTIL = "pin_lock_until"
        private const val PAIR_PUBLIC = "pair_public"
        private const val PAIR_PRIVATE = "pair_private"
        private const val PHONE_KEY_PREFIX = "phone_key_"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val AT_REST_ALIAS = "vault_nest_wear_at_rest_v1"
        private const val PAIR_WRAP_ALIAS = "vault_nest_wear_pair_wrap_v1"
        private val RANDOM = SecureRandom()
    }
}

object WatchProtocol {
    const val VERSION = 1
    const val PAIR_REQUEST = "/vaultnest/watch/pair/request"
    const val PAIR_PUBLIC_KEY = "/vaultnest/watch/pair/public-key"
    const val SYNC = "/vaultnest/watch/sync"
    const val CLEAR = "/vaultnest/watch/clear"
    const val ACK = "/vaultnest/watch/ack"
}
