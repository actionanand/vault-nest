package com.actionanand.vaultnest.wear

import android.util.Base64
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.nio.charset.StandardCharsets

class WatchVaultListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        val repository = WatchVaultRepository(applicationContext)
        when (event.path) {
            WatchProtocol.PAIR_REQUEST -> handlePairRequest(repository, event)
            WatchProtocol.SYNC -> handleSync(repository, event)
            WatchProtocol.CLEAR -> handleClear(repository, event)
        }
    }

    private fun handlePairRequest(repository: WatchVaultRepository, event: MessageEvent) {
        runCatching {
            val request = JSONObject(String(event.data, StandardCharsets.UTF_8))
            require(request.getInt("version") == WatchProtocol.VERSION)
            repository.configureInitialPinRequirement(request.optBoolean("pinRequired", true))
            if (repository.pinRequired() && !repository.hasPin()) return
            repository.storePhonePublicKey(
                event.sourceNodeId,
                Base64.decode(request.getString("publicKey"), Base64.NO_WRAP),
            )
            val response = JSONObject()
                .put("version", WatchProtocol.VERSION)
                .put(
                    "publicKey",
                    Base64.encodeToString(repository.ownTransportKeyPair().public.encoded, Base64.NO_WRAP),
                )
            Wearable.getMessageClient(this).sendMessage(
                event.sourceNodeId,
                WatchProtocol.PAIR_PUBLIC_KEY,
                response.toString().toByteArray(StandardCharsets.UTF_8),
            )
        }
    }

    private fun handleSync(repository: WatchVaultRepository, event: MessageEvent) {
        runCatching {
            val plaintext = repository.decryptTransport(event.path, event.sourceNodeId, event.data)
            val payload = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            require(payload.getInt("version") == WatchProtocol.VERSION)
            val pinRequired = payload.optBoolean("pinRequired", true)
            val entriesJson = payload.getJSONArray("entries")
            require(entriesJson.length() <= BuildConfig.WATCH_VAULT_MAX_ENTRIES)
            val entries = buildList {
                for (index in 0 until entriesJson.length()) {
                    val item = entriesJson.getJSONObject(index)
                    add(
                        WatchEntry(
                            id = item.getString("id"),
                            title = item.getString("title"),
                            username = item.optString("username"),
                            password = item.getString("password"),
                            updatedAt = item.optString("updatedAt"),
                        ),
                    )
                }
            }
            repository.setPinRequired(pinRequired)
            repository.replace(entries)
            acknowledge(event.sourceNodeId, "synced", entries.size)
        }.onFailure { acknowledge(event.sourceNodeId, "rejected", 0) }
    }

    private fun handleClear(repository: WatchVaultRepository, event: MessageEvent) {
        runCatching {
            val plaintext = repository.decryptTransport(event.path, event.sourceNodeId, event.data)
            val payload = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            WatchPayloadValidator.validateClear(payload.getInt("version"))
            repository.clearEntries()
            acknowledge(event.sourceNodeId, "cleared", 0)
        }.onFailure { acknowledge(event.sourceNodeId, "rejected", 0) }
    }

    private fun acknowledge(nodeId: String, status: String, count: Int) {
        val acknowledgement = JSONObject()
            .put("version", WatchProtocol.VERSION)
            .put("status", status)
            .put("count", count)
            .put("timestamp", System.currentTimeMillis())
        Wearable.getMessageClient(this).sendMessage(
            nodeId,
            WatchProtocol.ACK,
            acknowledgement.toString().toByteArray(StandardCharsets.UTF_8),
        )
    }
}
