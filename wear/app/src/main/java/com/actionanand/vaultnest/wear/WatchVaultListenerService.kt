package com.actionanand.vaultnest.wear

import android.util.Base64
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.nio.charset.StandardCharsets

class WatchVaultListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        val repository = WatchVaultRepository(applicationContext)
        when (event.path) {
            WatchProtocol.PAIR_REQUEST -> handlePairRequest(repository, event.sourceNodeId, event.data)
            WatchProtocol.SYNC -> handleSync(repository, event)
            WatchProtocol.CLEAR -> handleClear(repository, event)
        }
    }

    override fun onDataChanged(events: DataEventBuffer) {
        val repository = WatchVaultRepository(applicationContext)
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            val path = item.uri.path
            val sourceNodeId = item.uri.host
            val data = item.data
            if (path == WatchProtocol.PAIR_REQUEST && sourceNodeId != null && data != null) {
                handlePairRequest(repository, sourceNodeId, data)
            }
        }
    }

    private fun handlePairRequest(
        repository: WatchVaultRepository,
        sourceNodeId: String,
        data: ByteArray,
    ) {
        runCatching {
            val request = JSONObject(String(data, StandardCharsets.UTF_8))
            require(request.getInt("version") == WatchProtocol.VERSION)
            repository.configureInitialPinRequirement(request.optBoolean("pinRequired", true))
            repository.storePhonePublicKey(
                sourceNodeId,
                Base64.decode(request.getString("publicKey"), Base64.NO_WRAP),
            )
            val response = JSONObject()
                .put("version", WatchProtocol.VERSION)
                .put("timestamp", System.currentTimeMillis())
                .put(
                    "publicKey",
                    Base64.encodeToString(repository.ownTransportKeyPair().public.encoded, Base64.NO_WRAP),
                )
            val payload = response.toString().toByteArray(StandardCharsets.UTF_8)
            Wearable.getDataClient(this).putDataItem(
                PutDataRequest.create(WatchProtocol.PAIR_PUBLIC_KEY)
                    .setData(payload)
                    .setUrgent(),
            )
            Wearable.getMessageClient(this).sendMessage(
                sourceNodeId,
                WatchProtocol.PAIR_PUBLIC_KEY,
                payload,
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
                            origin = WatchEntryOrigin.PHONE,
                        ),
                    )
                }
            }
            repository.setPinRequired(pinRequired)
            repository.replacePhoneEntries(entries)
            acknowledge(event.sourceNodeId, "synced", entries.size)
        }.onFailure { acknowledge(event.sourceNodeId, "rejected", 0) }
    }

    private fun handleClear(repository: WatchVaultRepository, event: MessageEvent) {
        runCatching {
            val plaintext = repository.decryptTransport(event.path, event.sourceNodeId, event.data)
            val payload = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            WatchPayloadValidator.validateClear(payload.getInt("version"))
            repository.clearPhoneEntries()
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
