# sn-TCP-Tunnel

**Forward your Supernote's screen sharing over USB — no WiFi needed.**

Supernote's built-in screen mirroring only works over WiFi. This plugin adds a TCP relay
inside the device so the stream travels through the USB cable you already have plugged in.

**Source:** [github.com/gorlix/sn-tcp-tunnel](https://github.com/gorlix/sn-tcp-tunnel) |
**Author:** [Gorlix](https://github.com/gorlix) |
**Version:** 1.0.0

---

## Requirements

| What | Where |
| ---- | ----- |
| Supernote A5X / A6X / Nomad with **PluginHost** | on device |
| **ADB** (Android Debug Bridge) — [download](https://developer.android.com/tools/releases/platform-tools) | on PC |
| USB cable | — |

No WiFi. No Android Studio. No extra apps.

---

## Install

1. Download `snTCPTunnel.snplg` from [Releases](../../releases/latest)
2. Copy it to the Supernote (USB or WiFi transfer)
3. On the Supernote: **PluginHost → Install Plugin → select the file**
4. A **TCP Tunnel** button appears in the toolbar

---

## Usage

1. Plug the Supernote into your PC via USB
2. Tap **TCP Tunnel** in the toolbar — the control panel opens
3. Tap **AVVIA TUNNEL** — the dot turns solid (relay active)
4. On your PC, run the command shown in the control panel:

   ```sh
   adb forward tcp:8080 tcp:8888
   ```

5. Open `http://localhost:8080` in your browser — your screen appears live

To stop: tap **SPEGNI TUNNEL** or simply unplug the cable.

---

## Configuration

Tap **Impostazioni ›** in the control panel, or open Supernote's plugin settings and
tap the gear icon next to the plugin.

| Setting | Default | Notes |
| ------- | ------- | ----- |
| Host destinazione | `100.113.43.44` | Target TCP host (e.g. Tailscale IP) |
| Porta destinazione | `8080` | Presets: Screen Mirroring (8080), Browse & Access (8081) |
| Porta ascolto (device) | `8888` | Local port the relay binds on the Supernote |

The ADB command in the control panel updates automatically when you change ports.

---

## Language support

The UI follows the Supernote system language automatically. Supported: **Italian** and
**English** (fallback). No configuration needed — change the language in Supernote's
settings and the plugin updates live.

To add a language, extend the `translations` object in
[`src/i18n.ts`](src/i18n.ts) and add the new locale code to the `Locale` type.

---

## Troubleshooting

**"Porta occupata" error on start**
Port 8888 is held by a stale process (usually after a crash or a previous socat session).
Reboot the Supernote to clear it. Alternatively, change the *Porta ascolto* in Settings.

**EADDRINUSE after reinstall**
The plugin auto-retries once by force-stopping the previous socket. If it still fails,
reboot.

---

## Build from source

<details>
<summary>Prerequisites</summary>

- Node.js 18+
- JDK 21
- Android SDK (Platform 35, Build-Tools 35.0.0)

```bash
# Arch Linux
sudo pacman -S jdk21-openjdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk

# Android SDK (no Android Studio needed)
# Download command-line tools from https://developer.android.com/studio#command-tools
sdkmanager "platforms;android-35" "build-tools;35.0.0"

export ANDROID_HOME=$HOME/Android/Sdk
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties
```

</details>

```bash
git clone https://github.com/gorlix/sn-tcp-tunnel
cd sn-tcp-tunnel
npm install
./buildPlugin.sh
# Output: build/outputs/snTCPTunnel.snplg
```

---

## License

MIT © [Gorlix](https://github.com/gorlix)
