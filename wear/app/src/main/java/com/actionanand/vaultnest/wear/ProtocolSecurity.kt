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

object WatchEntryCollection {
    fun mergePhoneEntries(
        existing: List<WatchEntry>,
        incoming: List<WatchEntry>,
        phoneMaximum: Int,
        localMaximum: Int,
    ): List<WatchEntry> {
        val phoneEntries = incoming.map { it.copy(origin = WatchEntryOrigin.PHONE) }
        val merged = existing.filter { it.origin == WatchEntryOrigin.WATCH } + phoneEntries
        validateLimits(merged, phoneMaximum, localMaximum)
        require(merged.map { it.id }.distinct().size == merged.size) { "Duplicate entry identifiers" }
        return merged
    }

    fun clearPhoneEntries(existing: List<WatchEntry>): List<WatchEntry> =
        existing.filter { it.origin == WatchEntryOrigin.WATCH }

    fun addLocalEntry(
        existing: List<WatchEntry>,
        entry: WatchEntry,
        phoneMaximum: Int,
        localMaximum: Int,
    ): List<WatchEntry> {
        require(entry.origin == WatchEntryOrigin.WATCH) { "Local entry must be watch-only" }
        require(existing.none { it.id == entry.id }) { "Duplicate entry identifier" }
        return (existing + entry).also { validateLimits(it, phoneMaximum, localMaximum) }
    }

    fun deleteLocalEntry(existing: List<WatchEntry>, id: String): List<WatchEntry> =
        existing.filterNot { it.id == id && it.origin == WatchEntryOrigin.WATCH }

    fun validateLimits(entries: List<WatchEntry>, phoneMaximum: Int, localMaximum: Int) {
        require(entries.count { it.origin == WatchEntryOrigin.PHONE } <= phoneMaximum) {
            "Synced Watch Vault limit exceeded"
        }
        require(entries.count { it.origin == WatchEntryOrigin.WATCH } <= localMaximum) {
            "Local Watch Vault limit exceeded"
        }
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
                    .put("updatedAt", entry.updatedAt)
                    .put("origin", entry.origin.name),
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
                        if (item.has("origin")) {
                            WatchEntryOrigin.valueOf(item.getString("origin"))
                        } else {
                            WatchEntryOrigin.PHONE
                        },
                    ),
                )
            }
        }
    }
}

object WatchPasswordGenerator {
    private const val UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    private const val LOWER = "abcdefghijkmnopqrstuvwxyz"
    private const val DIGITS = "23456789"
    private const val SYMBOLS = "!@#\$%&*+-=?"
    private const val ALL = UPPER + LOWER + DIGITS + SYMBOLS

    fun generate(length: Int = 20, random: SecureRandom = SecureRandom()): String {
        require(length >= 4) { "Password length must be at least 4" }
        val characters = mutableListOf(
            UPPER.randomCharacter(random),
            LOWER.randomCharacter(random),
            DIGITS.randomCharacter(random),
            SYMBOLS.randomCharacter(random),
        )
        repeat(length - characters.size) { characters += ALL.randomCharacter(random) }
        for (index in characters.lastIndex downTo 1) {
            val other = random.nextInt(index + 1)
            val value = characters[index]
            characters[index] = characters[other]
            characters[other] = value
        }
        return characters.joinToString("")
    }

    private fun String.randomCharacter(random: SecureRandom): Char = this[random.nextInt(length)]
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
