package com.actionanand.vaultnest.wear

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private lateinit var repository: WatchVaultRepository
    private var locked by mutableStateOf(true)
    private var repositoryRevision by mutableStateOf(0)
    private val repositoryListener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
        repositoryRevision++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        repository = WatchVaultRepository(applicationContext)
        setContent {
            key(repositoryRevision) {
                VaultNestWearTheme {
                    if (!repository.integrationConfigured()) {
                        WaitingForPhoneScreen()
                    } else if (repository.pinRequired() && !repository.hasPin()) {
                        PinSetupScreen(repository) { locked = false }
                    } else if (repository.pinRequired() && locked) {
                        PinUnlockScreen(repository) { locked = false }
                    } else {
                        VaultScreen(repository) { locked = true }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        repositoryRevision++
    }

    override fun onStart() {
        super.onStart()
        repository.registerChangeListener(repositoryListener)
    }

    override fun onStop() {
        repository.unregisterChangeListener(repositoryListener)
        locked = true
        super.onStop()
    }
}

@Composable
private fun WaitingForPhoneScreen() {
    Scaffold(timeText = { TimeText() }) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item { Text("Vault Nest", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            item {
                Text(
                    "Enable Wear OS integration on the phone, then send a credential.",
                    textAlign = TextAlign.Center,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun VaultNestWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = MaterialTheme.colors.copy(
            primary = Color(0xFFBFEA78),
            onPrimary = Color(0xFF102107),
            background = Color(0xFF0E1713),
            surface = Color(0xFF15201B),
            onSurface = Color(0xFFEDF4EF),
        ),
        content = content,
    )
}

@Composable
private fun PinSetupScreen(repository: WatchVaultRepository, onComplete: () -> Unit) {
    var firstPin by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("Create a 4–6 digit Watch PIN") }
    PinPad(
        title = "Set Watch PIN",
        message = message,
        pinLength = pin.length,
        onDigit = { digit -> if (pin.length < 6) pin += digit },
        onDelete = { if (pin.isNotEmpty()) pin = pin.dropLast(1) },
        onSubmit = {
            if (pin.length !in 4..6) {
                message = "Use 4 to 6 digits"
            } else if (firstPin.isEmpty()) {
                firstPin = pin
                pin = ""
                message = "Enter the same PIN again"
            } else if (pin != firstPin) {
                firstPin = ""
                pin = ""
                message = "PINs did not match. Start again."
            } else {
                repository.setupPin(pin)
                onComplete()
            }
        },
    )
}

@Composable
private fun PinUnlockScreen(repository: WatchVaultRepository, onUnlocked: () -> Unit) {
    var pin by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("Enter Watch PIN") }
    PinPad(
        title = "Vault Nest",
        message = message,
        pinLength = pin.length,
        onDigit = { digit -> if (pin.length < 6) pin += digit },
        onDelete = { if (pin.isNotEmpty()) pin = pin.dropLast(1) },
        onSubmit = {
            val result = repository.verifyPin(pin)
            pin = ""
            when {
                result.success -> onUnlocked()
                result.waitMillis > 0 -> message = "Try again in ${maxOf(1, result.waitMillis / 1000)} seconds"
                else -> message = "Incorrect PIN"
            }
        },
    )
}

@Composable
private fun PinPad(
    title: String,
    message: String,
    pinLength: Int,
    onDigit: (String) -> Unit,
    onDelete: () -> Unit,
    onSubmit: () -> Unit,
) {
    Scaffold(timeText = { TimeText() }) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item { Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            item { Text(message, textAlign = TextAlign.Center, fontSize = 12.sp) }
            item { Text("• ".repeat(pinLength), fontSize = 22.sp, color = MaterialTheme.colors.primary) }
            items(listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"))) { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { digit -> NumericButton(digit) { onDigit(digit) } }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumericButton("⌫", onDelete)
                    NumericButton("0") { onDigit("0") }
                    NumericButton("✓", onSubmit)
                }
            }
        }
    }
}

@Composable
private fun NumericButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(backgroundColor = MaterialTheme.colors.surface),
    ) { Text(label, fontWeight = FontWeight.Bold) }
}

@Composable
private fun VaultScreen(repository: WatchVaultRepository, onLock: () -> Unit) {
    var entries by remember { mutableStateOf(runCatching(repository::entries).getOrDefault(emptyList())) }
    var selected by remember { mutableStateOf<WatchEntry?>(null) }
    var confirmReset by remember { mutableStateOf(false) }
    if (selected != null) {
        PasswordDetail(selected!!, onBack = { selected = null })
        return
    }
    Scaffold(timeText = { TimeText() }) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item { Text("Vault Nest", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            item { Text("${entries.size} / ${BuildConfig.WATCH_VAULT_MAX_ENTRIES} passwords", fontSize = 11.sp) }
            if (entries.isEmpty()) {
                item { Text("Sync selected passwords from the phone.", textAlign = TextAlign.Center, fontSize = 12.sp) }
            } else {
                items(entries, key = { it.id }) { entry ->
                    Chip(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { selected = entry },
                        label = { Text(entry.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        secondaryLabel = { Text(if (entry.username.isBlank()) "Password" else entry.username, maxLines = 1) },
                        colors = ChipDefaults.secondaryChipColors(),
                    )
                }
            }
            item {
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { entries = runCatching(repository::entries).getOrDefault(emptyList()) },
                    label = { Text("Refresh synced items") },
                )
            }
            if (repository.pinRequired()) {
                item {
                    Chip(modifier = Modifier.fillMaxWidth(), onClick = onLock, label = { Text("Lock") })
                }
            }
            item {
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        if (confirmReset) {
                            repository.resetAll()
                            onLock()
                        } else confirmReset = true
                    },
                    label = { Text(if (confirmReset) "Tap again: erase and reset" else "Erase Watch Vault") },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF4A2024)),
                )
            }
        }
    }
}

@Composable
private fun PasswordDetail(entry: WatchEntry, onBack: () -> Unit) {
    var revealed by remember(entry.id) { mutableStateOf(false) }
    LaunchedEffect(revealed) {
        if (revealed) {
            delay(10_000)
            revealed = false
        }
    }
    Scaffold(timeText = { TimeText() }) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item { Text(entry.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center) }
            if (entry.username.isNotBlank()) {
                item { DetailValue("Username", entry.username) }
            }
            item { DetailValue("Password", if (revealed) entry.password else "••••••••") }
            item {
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { revealed = !revealed },
                    label = { Text(if (revealed) "Hide password" else "Show for 10 seconds") },
                )
            }
            item {
                val context = androidx.compose.ui.platform.LocalContext.current
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { copySensitive(context, entry.password) },
                    label = { Text("Copy password") },
                )
            }
            item { Chip(modifier = Modifier.fillMaxWidth(), onClick = onBack, label = { Text("Back") }) }
        }
    }
}

@Composable
private fun DetailValue(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 10.sp, color = Color(0xFFAAB8B0))
        Text(value, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

private fun copySensitive(context: Context, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    val clip = ClipData.newPlainText("Vault Nest password", value)
    val extras = PersistableBundle().apply { putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true) }
    clip.description.extras = extras
    clipboard.setPrimaryClip(clip)
    Handler(Looper.getMainLooper()).postDelayed({
        val current = clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()
        if (current == value) clipboard.clearPrimaryClip()
    }, 60_000)
}
