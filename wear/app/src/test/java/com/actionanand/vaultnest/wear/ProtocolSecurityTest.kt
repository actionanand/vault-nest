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
    private val localMaximum = BuildConfig.WATCH_VAULT_MAX_LOCAL_ENTRIES
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
        val entries = listOf(
            entry("first"),
            entry("second").copy(username = "another-user", origin = WatchEntryOrigin.WATCH),
        )
        assertEquals(entries, WatchEntryCodec.decode(WatchEntryCodec.encode(entries)))
    }

    @Test
    fun legacyEntriesMigrateToPhoneOrigin() {
        val decoded = WatchEntryCodec.decode(
            """[{"id":"legacy","title":"Old","username":"","password":"secret","updatedAt":""}]""",
        )
        assertEquals(WatchEntryOrigin.PHONE, decoded.single().origin)
    }

    @Test
    fun corruptEntryRecordIsRejected() {
        assertThrows(RuntimeException::class.java) {
            WatchEntryCodec.decode("""[{"id":"broken","title":"Missing password"}]""")
        }
        assertThrows(IllegalArgumentException::class.java) {
            WatchEntryCodec.decode(
                """[{"id":"broken","title":"Bad origin","password":"secret","origin":"CLOUD"}]""",
            )
        }
    }

    @Test
    fun phoneSyncAndClearPreserveWatchOnlyEntries() {
        val local = entry("local").copy(origin = WatchEntryOrigin.WATCH)
        val oldPhone = entry("old-phone")
        val newPhone = entry("new-phone")
        val merged = WatchEntryCollection.mergePhoneEntries(
            listOf(local, oldPhone),
            listOf(newPhone),
            maximum,
            localMaximum,
        )
        assertEquals(listOf(local, newPhone), merged)
        assertEquals(listOf(local), WatchEntryCollection.clearPhoneEntries(merged))
    }

    @Test
    fun localDeletionCannotDeleteSyncedEntries() {
        val local = entry("local").copy(origin = WatchEntryOrigin.WATCH)
        val phone = entry("phone")
        assertEquals(listOf(phone), WatchEntryCollection.deleteLocalEntry(listOf(local, phone), "local"))
        assertEquals(listOf(phone), WatchEntryCollection.deleteLocalEntry(listOf(phone), "phone"))
    }

    @Test
    fun localAndPhoneLimitsAreIndependent() {
        val phoneEntries = (1..maximum).map { entry("phone-$it") }
        val localEntries = (1..localMaximum).map { entry("local-$it").copy(origin = WatchEntryOrigin.WATCH) }
        WatchEntryCollection.validateLimits(phoneEntries + localEntries, maximum, localMaximum)
        assertThrows(IllegalArgumentException::class.java) {
            WatchEntryCollection.validateLimits(
                phoneEntries + localEntries + entry("too-many").copy(origin = WatchEntryOrigin.WATCH),
                maximum,
                localMaximum,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            WatchEntryCollection.addLocalEntry(
                phoneEntries + localEntries,
                entry("another-local").copy(origin = WatchEntryOrigin.WATCH),
                maximum,
                localMaximum,
            )
        }
    }

    @Test
    fun generatedPasswordHasRequestedLengthAndEveryCharacterClass() {
        val password = WatchPasswordGenerator.generate(20)
        assertEquals(20, password.length)
        assertTrue(password.any(Char::isUpperCase))
        assertTrue(password.any(Char::isLowerCase))
        assertTrue(password.any(Char::isDigit))
        assertTrue(password.any { !it.isLetterOrDigit() })
    }

    @Test
    fun wrongPinFailsConstantTimeHashVerification() {
        val salt = ByteArray(16) { (it + 1).toByte() }
        val expected = PinHasher.hash("2468".toCharArray(), salt, 10_000)
        assertTrue(java.security.MessageDigest.isEqual(expected, PinHasher.hash("2468".toCharArray(), salt, 10_000)))
        assertFalse(java.security.MessageDigest.isEqual(expected, PinHasher.hash("1357".toCharArray(), salt, 10_000)))
    }
}
