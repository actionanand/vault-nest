package com.actionanand.vaultnest.wear

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.wear.compose.foundation.BasicSwipeToDismissBox
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

class MainActivity : ComponentActivity() {
    private lateinit var repository: WatchVaultRepository
    private var locked by mutableStateOf(true)
    private var repositoryRevision by mutableStateOf(0)
    private val repositoryListener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
        repositoryRevision++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        repository = WatchVaultRepository(applicationContext)
        setContent {
            val currentRevision = repositoryRevision
            var onboardingRoute by rememberSaveable { mutableStateOf("welcome") }
            VaultNestWearTheme {
                when {
                    !repository.integrationConfigured() && onboardingRoute == "welcome" -> StandaloneOnboardingScreen(
                        onSetUpOnWatch = { onboardingRoute = "local" },
                        onConnectPhone = { onboardingRoute = "phone" },
                    )
                    !repository.integrationConfigured() && onboardingRoute == "phone" -> PhoneConnectionScreen(
                        onRefresh = { repositoryRevision++ },
                        onSetUpOnWatch = { onboardingRoute = "local" },
                    )
                    (onboardingRoute == "local" && !repository.hasPin()) ||
                        (repository.pinRequired() && !repository.hasPin()) -> PinSetupScreen(repository) {
                        locked = false
                        onboardingRoute = "welcome"
                    }
                    repository.pinRequired() && locked -> PinUnlockScreen(repository) {
                        locked = false
                    }
                    else -> VaultScreen(
                        repository = repository,
                        repositoryRevision = currentRevision,
                        onLock = { locked = true },
                    )
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
private fun StandaloneOnboardingScreen(onSetUpOnWatch: () -> Unit, onConnectPhone: () -> Unit) {
    WearScrollableScaffold {
        item {
            Image(
                painter = painterResource(R.drawable.vault_nest_brand),
                contentDescription = null,
                modifier = Modifier.size(48.dp),
            )
        }
        item { Text("Vault Nest", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        item {
            Text(
                "Create and store passwords securely on this watch. A phone is optional.",
                textAlign = TextAlign.Center,
                fontSize = 12.sp,
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onSetUpOnWatch,
                label = { Text("Set up on this watch") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onConnectPhone,
                label = { Text("Connect Android phone") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

@Composable
private fun PhoneConnectionScreen(onRefresh: () -> Unit, onSetUpOnWatch: () -> Unit) {
    val context = LocalContext.current
    var status by remember {
        mutableStateOf("Your vault stays empty until you choose a credential on the paired phone.")
    }
    WearScrollableScaffold {
        item {
            Image(
                painter = painterResource(R.drawable.vault_nest_brand),
                contentDescription = null,
                modifier = Modifier.size(48.dp),
            )
        }
        item {
            Text(
                "Connect Android phone",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
        item {
            Text(
                status,
                textAlign = TextAlign.Center,
                fontSize = 12.sp,
            )
        }
        item {
            Text(
                "Open Vault Nest on your paired phone and enable Wear OS. You can also use this watch without a phone.",
                textAlign = TextAlign.Start,
                fontSize = 12.sp,
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    openOnPhone(context, Uri.parse("vaultnest://wear-os")) { result -> status = result }
                },
                label = { Text("Open phone setup") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    openOnPhone(
                        context,
                        Uri.parse("https://play.google.com/store/apps/details?id=com.actionanand.vaultnest.app"),
                    ) { result -> status = result }
                },
                label = { Text("Install or update phone app") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onSetUpOnWatch,
                label = { Text("Set up on this watch") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    status = "Checking again. Pairing also resumes automatically after the phone reconnects."
                    onRefresh()
                },
                label = { Text("Check again") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

private fun openOnPhone(context: Context, uri: Uri, onResult: (String) -> Unit) {
    onResult("Opening Vault Nest on your paired phone…")
    val executor = ContextCompat.getMainExecutor(context)
    val intent = Intent(Intent.ACTION_VIEW, uri)
        .addCategory(Intent.CATEGORY_BROWSABLE)
    val future = runCatching {
        RemoteActivityHelper(context, executor).startRemoteActivity(intent, null)
    }.getOrElse {
        onResult("Phone unavailable. Check that it is paired and Vault Nest is installed.")
        return
    }
    future.addListener(
        {
            runCatching(future::get).fold(
                onSuccess = { onResult("Continue setup in Vault Nest on your phone.") },
                onFailure = {
                    onResult("Phone unavailable. Check that it is paired and Vault Nest is installed.")
                },
            )
        },
        executor,
    )
}

@Composable
private fun VaultNestWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = MaterialTheme.colors.copy(
            primary = Color(0xFFBFEA78),
            onPrimary = Color(0xFF102107),
            background = Color.Black,
            surface = Color(0xFF171717),
            onSurface = Color(0xFFF4F4F4),
        ),
        content = content,
    )
}

@Composable
private fun WearScrollableScaffold(content: ScalingLazyListScope.() -> Unit) {
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
    Scaffold(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        timeText = { TimeText() },
        positionIndicator = {
            PositionIndicator(scalingLazyListState = listState)
        },
    ) {
        ScalingLazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
    }
}

@Composable
private fun PinSetupScreen(repository: WatchVaultRepository, onComplete: () -> Unit) {
    val scope = rememberCoroutineScope()
    var firstPin by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("Create a 4–6 digit Watch PIN") }
    var busy by remember { mutableStateOf(false) }
    PinPad(
        title = "Set Watch PIN",
        message = message,
        pinLength = pin.length,
        busy = busy,
        onDigit = { digit -> if (!busy && pin.length < 6) pin += digit },
        onDelete = { if (!busy && pin.isNotEmpty()) pin = pin.dropLast(1) },
        onSubmit = {
            if (busy) {
                Unit
            } else if (pin.length !in 4..6) {
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
                val confirmedPin = pin
                busy = true
                message = "Saving Watch PIN…"
                scope.launch {
                    val saved = runCatching {
                        withContext(Dispatchers.Default) { repository.setupPin(confirmedPin) }
                    }
                    busy = false
                    saved.fold(
                        onSuccess = { onComplete() },
                        onFailure = {
                            firstPin = ""
                            pin = ""
                            message = "PIN setup failed. Try again."
                        },
                    )
                }
            }
        },
    )
}

@Composable
private fun PinUnlockScreen(repository: WatchVaultRepository, onUnlocked: () -> Unit) {
    val scope = rememberCoroutineScope()
    var pin by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("Enter Watch PIN") }
    var busy by remember { mutableStateOf(false) }
    PinPad(
        title = "Vault Nest",
        message = message,
        pinLength = pin.length,
        busy = busy,
        onDigit = { digit -> if (!busy && pin.length < 6) pin += digit },
        onDelete = { if (!busy && pin.isNotEmpty()) pin = pin.dropLast(1) },
        onSubmit = {
            if (!busy) {
                val submittedPin = pin
                pin = ""
                busy = true
                message = "Checking PIN…"
                scope.launch {
                    val verification = runCatching {
                        withContext(Dispatchers.Default) { repository.verifyPin(submittedPin) }
                    }
                    busy = false
                    verification.fold(
                        onSuccess = { result ->
                            when {
                                result.success -> onUnlocked()
                                result.waitMillis > 0 -> {
                                    message = "Try again in ${maxOf(1, result.waitMillis / 1000)} seconds"
                                }
                                else -> message = "Incorrect PIN"
                            }
                        },
                        onFailure = { message = "PIN could not be checked. Try again." },
                    )
                }
            }
        },
    )
}

@Composable
private fun PinPad(
    title: String,
    message: String,
    pinLength: Int,
    busy: Boolean,
    onDigit: (String) -> Unit,
    onDelete: () -> Unit,
    onSubmit: () -> Unit,
) {
    WearScrollableScaffold {
        item { Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        item { Text(message, textAlign = TextAlign.Center, fontSize = 12.sp) }
        item { Text("• ".repeat(pinLength), fontSize = 22.sp, color = MaterialTheme.colors.primary) }
        items(listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"))) { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { digit -> NumericButton(digit, enabled = !busy) { onDigit(digit) } }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NumericButton("⌫", enabled = !busy, onClick = onDelete)
                NumericButton("0", enabled = !busy) { onDigit("0") }
                NumericButton("✓", enabled = !busy, onClick = onSubmit)
            }
        }
    }
}

@Composable
private fun NumericButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        modifier = Modifier.size(48.dp),
        enabled = enabled,
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(backgroundColor = MaterialTheme.colors.surface),
    ) { Text(label, fontWeight = FontWeight.Bold) }
}

@Composable
private fun VaultScreen(
    repository: WatchVaultRepository,
    repositoryRevision: Int,
    onLock: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf(emptyList<WatchEntry>()) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var generatorOpen by rememberSaveable { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    var resetBusy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(repositoryRevision) {
        val loadedEntries = withContext(Dispatchers.IO) {
            runCatching(repository::entries)
        }
        entries = loadedEntries.getOrElse {
            message = "Stored credentials could not be opened. Reset the Watch Vault and sync again."
            emptyList()
        }
    }

    val selected = entries.firstOrNull { it.id == selectedId }
    if (selected != null) {
        PasswordDetail(
            entry = selected,
            onBack = { selectedId = null },
            onDelete = if (selected.origin == WatchEntryOrigin.WATCH) {
                {
                    scope.launch {
                        val result = runCatching {
                            withContext(Dispatchers.IO) { repository.deleteWatchEntry(selected.id) }
                        }
                        result.fold(
                            onSuccess = {
                                entries = entries.filterNot { it.id == selected.id }
                                selectedId = null
                                message = "Watch-only password deleted."
                            },
                            onFailure = { message = "Password could not be deleted." },
                        )
                    }
                }
            } else null,
        )
        return
    }

    if (generatorOpen) {
        PasswordGeneratorScreen(
            onCancel = { generatorOpen = false },
            onSave = { label, password ->
                scope.launch {
                    val entry = WatchEntry(
                        id = "watch-${UUID.randomUUID()}",
                        title = label,
                        username = "",
                        password = password,
                        updatedAt = Instant.now().toString(),
                        origin = WatchEntryOrigin.WATCH,
                    )
                    val result = runCatching {
                        withContext(Dispatchers.IO) { repository.addWatchEntry(entry) }
                    }
                    result.fold(
                        onSuccess = {
                            entries = entries + entry
                            generatorOpen = false
                            message = "Password saved on this watch."
                        },
                        onFailure = { message = "Local password limit reached." },
                    )
                }
            },
        )
        return
    }

    WearScrollableScaffold {
        item { Text("Vault Nest", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        item {
            Text(
                "${entries.count { it.origin == WatchEntryOrigin.WATCH }} / ${BuildConfig.WATCH_VAULT_MAX_LOCAL_ENTRIES} watch only  •  " +
                    "${entries.count { it.origin == WatchEntryOrigin.PHONE }} / ${BuildConfig.WATCH_VAULT_MAX_ENTRIES} synced",
                fontSize = 11.sp,
            )
        }
        message?.let { currentMessage ->
            item { Text(currentMessage, fontSize = 12.sp, textAlign = TextAlign.Center) }
        }
        if (entries.isEmpty()) {
            item {
                Text(
                    "No passwords yet. Generate one here or sync selected credentials from your phone.",
                    textAlign = TextAlign.Center,
                    fontSize = 12.sp,
                )
            }
        } else {
            items(entries, key = { it.id }) { entry ->
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { selectedId = entry.id },
                    label = { Text(entry.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    secondaryLabel = {
                        Text(
                            if (entry.origin == WatchEntryOrigin.WATCH) "Watch only" else "Synced from phone",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                enabled = entries.count { it.origin == WatchEntryOrigin.WATCH } < BuildConfig.WATCH_VAULT_MAX_LOCAL_ENTRIES,
                onClick = { generatorOpen = true },
                label = { Text("Generate password") },
                secondaryLabel = { Text("Saved only on this watch") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    scope.launch {
                        entries = withContext(Dispatchers.IO) {
                            runCatching(repository::entries).getOrDefault(emptyList())
                        }
                        message = "Synced items refreshed."
                    }
                },
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
                    when {
                        resetBusy -> Unit
                        !confirmReset -> {
                            confirmReset = true
                            message = "Tap erase again to confirm."
                        }
                        else -> {
                            resetBusy = true
                            message = "Erasing Watch Vault…"
                            scope.launch {
                                val reset = runCatching {
                                    withContext(Dispatchers.IO) { repository.resetAll() }
                                }
                                resetBusy = false
                                reset.fold(
                                    onSuccess = { onLock() },
                                    onFailure = {
                                        confirmReset = false
                                        message = "Watch Vault could not be erased. Try again."
                                    },
                                )
                            }
                        }
                    }
                },
                label = {
                    Text(
                        when {
                            resetBusy -> "Erasing…"
                            confirmReset -> "Tap again: erase and reset"
                            else -> "Erase Watch Vault"
                        },
                    )
                },
                colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF4A2024)),
            )
        }
    }
}

@Composable
private fun PasswordGeneratorScreen(onCancel: () -> Unit, onSave: (String, String) -> Unit) {
    val labels = listOf("Email", "Wi-Fi", "Banking", "Work", "Watch password")
    var selectedLabel by rememberSaveable { mutableStateOf(labels.first()) }
    var password by remember { mutableStateOf(WatchPasswordGenerator.generate()) }
    WearScrollableScaffold {
        item { Text("Generate password", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        item { Text("20 characters • watch only", fontSize = 11.sp, color = Color(0xFFAAB8B0)) }
        item {
            Text(
                password,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = { password = WatchPasswordGenerator.generate() },
                label = { Text("Regenerate") },
            )
        }
        item { Text("Choose a label", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        items(labels) { label ->
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = { selectedLabel = label },
                label = { Text(if (selectedLabel == label) "✓ $label" else label) },
                colors = if (selectedLabel == label) {
                    ChipDefaults.primaryChipColors()
                } else {
                    ChipDefaults.secondaryChipColors()
                },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onSave(selectedLabel, password) },
                label = { Text("Save on watch") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onCancel,
                label = { Text("Cancel") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

@Composable
private fun PasswordDetail(entry: WatchEntry, onBack: () -> Unit, onDelete: (() -> Unit)?) {
    BasicSwipeToDismissBox(onDismissed = onBack) { isBackground ->
        if (isBackground) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black))
        } else {
            PasswordDetailContent(entry, onBack, onDelete)
        }
    }
}

@Composable
private fun PasswordDetailContent(entry: WatchEntry, onBack: () -> Unit, onDelete: (() -> Unit)?) {
    var revealed by remember(entry.id) { mutableStateOf(false) }
    var confirmDelete by remember(entry.id) { mutableStateOf(false) }
    LaunchedEffect(revealed) {
        if (revealed) {
            delay(10_000)
            revealed = false
        }
    }
    WearScrollableScaffold {
        item {
            Text(
                entry.title,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
        if (entry.username.isNotBlank()) {
            item { DetailValue("Username", entry.username) }
        }
        item {
            Text(
                if (entry.origin == WatchEntryOrigin.WATCH) "Watch only" else "Synced from phone",
                fontSize = 11.sp,
                color = Color(0xFFAAB8B0),
            )
        }
        item { DetailValue("Password", if (revealed) entry.password else "••••••••") }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = { revealed = !revealed },
                label = { Text(if (revealed) "Hide password" else "Show for 10 seconds") },
            )
        }
        if (onDelete != null) {
            item {
                Chip(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        if (confirmDelete) onDelete() else confirmDelete = true
                    },
                    label = { Text(if (confirmDelete) "Tap again to delete" else "Delete from watch") },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF4A2024)),
                )
            }
        }
        item {
            val context = LocalContext.current
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = { copySensitive(context, entry.password) },
                label = { Text("Copy password") },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onBack,
                label = { Text("Back") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

@Composable
private fun DetailValue(label: String, value: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label, fontSize = 10.sp, color = Color(0xFFAAB8B0))
        Text(value, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

private fun copySensitive(context: Context, value: String) {
    runCatching {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        val clip = ClipData.newPlainText("Vault Nest password", value)
        val extras = PersistableBundle().apply { putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true) }
        clip.description.extras = extras
        clipboard.setPrimaryClip(clip)
        Handler(Looper.getMainLooper()).postDelayed(
            {
                runCatching {
                    val current = clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()
                    if (current == value) clipboard.clearPrimaryClip()
                }
            },
            60_000,
        )
    }
}
