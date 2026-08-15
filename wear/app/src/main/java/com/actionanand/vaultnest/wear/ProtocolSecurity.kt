package com.actionanand.vaultnest.wear

import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.Cipher
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONObject

object WatchPayloadValidator {
    fun validate(version: Int, entries: List<WatchEntry>, maximum: Int) {
        require(version == WatchProtocol.VERSION) { "Unsupported protocol version" }
        require(entries.size <= maximum) { "Watch Vault limit exceeded" }
        require(entries.map { it.id }.distinct().size == entries.size) { "Duplicate entry identifiers" }
        require(entries.all { it.id.isNotBlank() && it.title.isNotBlank() && it.password.isNotEmpty() }) {
            "Invalid Watch Vault entry"
        }
    }

    fun validateClear(version: Int) {
        require(version == WatchProtocol.VERSION) { "Unsupported protocol version" }
    }
}

object WatchEntryCodec {
    fun encode(entries: List<WatchEntry>): String {
        val array = JSONArray()
        entries.forEach { entry ->
            array.put(
                JSONObject()
                    .put("id", entry.id)
                    .put("title", entry.title)
                    .put("username", entry.username)
                    .put("password", entry.password)
                    .put("updatedAt", entry.updatedAt),
            )
        }
        return array.toString()
    }

    fun decode(value: String): List<WatchEntry> {
        val array = JSONArray(value)
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    WatchEntry(
                        item.getString("id"),
                        item.getString("title"),
                        item.optString("username"),
                        item.getString("password"),
                        item.optString("updatedAt"),
                    ),
                )
            }
        }
    }
}

object PinHasher {
    fun hash(pin: CharArray, salt: ByteArray, iterations: Int = 210_000): ByteArray {
        val spec = PBEKeySpec(pin, salt, iterations, 256)
        return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
        finally { spec.clearPassword() }
    }

    fun matches(pin: CharArray, salt: ByteArray, expected: ByteArray): Boolean =
        MessageDigest.isEqual(expected, hash(pin, salt))
}

object AuthenticatedEncryption {
    private val random = SecureRandom()

    fun encrypt(key: ByteArray, plaintext: ByteArray, aad: String): Pair<ByteArray, ByteArray> {
        require(key.size == 32)
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
        return iv to cipher.doFinal(plaintext)
    }

    fun decrypt(key: ByteArray, iv: ByteArray, ciphertext: ByteArray, aad: String): ByteArray {
        require(key.size == 32)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
        return cipher.doFinal(ciphertext)
    }
}
