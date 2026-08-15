package com.actionanand.vaultnest.wear

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import javax.crypto.AEADBadTagException

class ProtocolSecurityTest {
    private val maximum = BuildConfig.WATCH_VAULT_MAX_ENTRIES
    private fun entry(id: String = "id-1") = WatchEntry(id, "Example", "user", "test-secret", "2026-01-01")

    @Test
    fun acceptsMaximumUniqueEntries() {
        WatchPayloadValidator.validate(WatchProtocol.VERSION, (1..maximum).map { entry("id-$it") }, maximum)
    }

    @Test
    fun rejectsMoreThanMaximumEntries() {
        assertThrows(IllegalArgumentException::class.java) {
            WatchPayloadValidator.validate(
                WatchProtocol.VERSION,
                (1..(maximum + 1)).map { entry("id-$it") },
                maximum,
            )
        }
    }

    @Test
    fun rejectsDuplicateEntriesAndUnsupportedVersions() {
        assertThrows(IllegalArgumentException::class.java) {
            WatchPayloadValidator.validate(WatchProtocol.VERSION, listOf(entry(), entry()), maximum)
        }
        assertThrows(IllegalArgumentException::class.java) {
            WatchPayloadValidator.validate(99, listOf(entry()), maximum)
        }
    }

    @Test
    fun clearOperationRejectsUnsupportedVersionsAndUsesAnEmptySnapshot() {
        WatchPayloadValidator.validateClear(WatchProtocol.VERSION)
        assertTrue(WatchEntryCodec.decode(WatchEntryCodec.encode(emptyList())).isEmpty())
        assertThrows(IllegalArgumentException::class.java) {
            WatchPayloadValidator.validateClear(99)
        }
    }

    @Test
    fun authenticatedEncryptionRejectsWrongKeyAndCorruption() {
        val key = ByteArray(32) { it.toByte() }
        val plaintext = "synthetic-test-value".toByteArray()
        val (iv, ciphertext) = AuthenticatedEncryption.encrypt(key, plaintext, "test-aad")
        assertArrayEquals(plaintext, AuthenticatedEncryption.decrypt(key, iv, ciphertext, "test-aad"))
        assertThrows(AEADBadTagException::class.java) {
            AuthenticatedEncryption.decrypt(ByteArray(32) { 7 }, iv, ciphertext, "test-aad")
        }
        val corrupted = ciphertext.copyOf().also { it[it.lastIndex] = (it.last() + 1).toByte() }
        assertThrows(AEADBadTagException::class.java) {
            AuthenticatedEncryption.decrypt(key, iv, corrupted, "test-aad")
        }
    }

    @Test
    fun entrySerializationRoundTripsWithoutChangingValues() {
        val entries = listOf(entry("first"), entry("second").copy(username = "another-user"))
        assertEquals(entries, WatchEntryCodec.decode(WatchEntryCodec.encode(entries)))
    }

    @Test
    fun wrongPinFailsConstantTimeHashVerification() {
        val salt = ByteArray(16) { (it + 1).toByte() }
        val expected = PinHasher.hash("2468".toCharArray(), salt, 10_000)
        assertTrue(java.security.MessageDigest.isEqual(expected, PinHasher.hash("2468".toCharArray(), salt, 10_000)))
        assertFalse(java.security.MessageDigest.isEqual(expected, PinHasher.hash("1357".toCharArray(), salt, 10_000)))
    }
}
