# sn-TCP-Tunnel

> **Show your Supernote screen on a projector or monitor using only a USB cable.**
> No WiFi needed. Works in classrooms, conference rooms, anywhere.

Supernote has a built-in screen sharing feature, but it requires WiFi — and WiFi in
schools, hotels, or conference rooms is often slow, restricted, or simply unavailable.

This plugin solves that: **plug in the USB cable you already carry and your screen
appears instantly on any computer or projector.**

---

## What you need

| | |
| - | - |
| 📱 | Supernote A5X, A6X, or Nomad with **PluginHost** installed |
| 💻 | A Windows, Mac, or Linux PC connected to a projector or monitor |
| 🔌 | The USB cable you use to charge the Supernote |
| ⚙️ | **ADB** — a small free tool from Google ([download here](https://developer.android.com/tools/releases/platform-tools), scroll to *Downloads*) |

That's it. No WiFi. No special hardware. No subscription.

---

## One-time setup (5 minutes)

### Step 1 — Install ADB on your PC

Download **Platform Tools** from the link above, unzip it anywhere (e.g. your Desktop),
and keep the folder handy.

**On Windows:** inside the unzipped folder, hold `Shift` and right-click → *Open
PowerShell window here*.

**On Mac / Linux:** open Terminal and `cd` to the unzipped folder.

### Step 2 — Install the plugin on the Supernote

1. Go to [**Releases**](../../releases/latest) on this page and download
   `sn-tcp-tunnel.snplg`
2. Copy the file to your Supernote (via USB drag-and-drop, or the Supernote Partner App)
3. On the Supernote, open **PluginHost** → tap **Install Plugin** → select the file
4. A small **TCP Tunnel** button appears in the toolbar at the top of your notes

### Step 3 — Enable USB debugging on the Supernote

On the Supernote, go to **Settings → System** and enable **ADB / USB Debugging**.
*(You only need to do this once.)*

---

## Every-day use (30 seconds)

> Before starting, make sure **Screen Mirroring** or **File Access** is active —
> tap the toggle bar at the top of the Supernote screen to enable it.

1. **Plug** the Supernote into your PC with the USB cable
2. **Tap the TCP Tunnel button** in the toolbar — a control panel appears
3. **Tap AVVIA TUNNEL** (or *Start Tunnel* in English) — the dot turns solid ●
4. **Copy the command** shown on screen and **paste it into the terminal** on your PC:

   ```sh
   adb forward tcp:8080 tcp:8888
   ```

5. **Open your browser** on the PC and go to:

   ```text
   http://localhost:8080
   ```

Your Supernote screen appears live in the browser. Mirror it to the projector like any
other browser tab.

**To stop:** tap *SPEGNI TUNNEL* (Stop Tunnel), or just unplug the cable.

---

## Settings

Tap **Impostazioni ›** (Settings) in the control panel to change the connection target.

| Setting | Default | When to change |
| ------- | ------- | -------------- |
| Host | `100.113.43.44` | If you use a different Tailscale or local network address |
| Port | `8080` | *Screen Mirroring* = 8080, *Browse & Access* = 8081 |
| Listen port | `8888` | Only if another app conflicts on port 8888 |

The command shown in the app always reflects the current settings — just copy and run it.

---

## Language

The plugin follows the Supernote system language automatically.
Currently supported: 🇮🇹 **Italian** and 🇬🇧 **English**.

Change the language in **Supernote Settings → Display & Input** and the plugin
updates instantly.

---

## Troubleshooting

**The tunnel fails to start ("Porta occupata" / "Port in use")**
Another process is holding port 8888 from a previous session. The quickest fix is to
**restart the Supernote**. Alternatively, tap Settings and change the Listen Port to
any free number (e.g. 7890).

**The browser shows nothing after `adb forward`**
Make sure Screen Mirroring is active on the Supernote *before* tapping Start Tunnel.
Open the toggle bar at the top of the screen and check.

**"device not found" in the terminal**
The USB cable must support data transfer (not charge-only). Try a different cable.
Make sure USB Debugging is enabled in Supernote Settings → System.

---

## For developers — build from source

<details>
<summary>Click to expand</summary>

**Prerequisites:** Node.js 18+, JDK 21, Android SDK (Platform 36, Build-Tools 36.1.0,
NDK 27.1.12297006)

```bash
# Android SDK setup (no Android Studio needed)
sdkmanager "platforms;android-36" "build-tools;36.1.0" "ndk;27.1.12297006"
export ANDROID_HOME=$HOME/Android/Sdk
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties
```

```bash
git clone https://github.com/gorlix/sn-tcp-tunnel
cd sn-tcp-tunnel
npm install
./buildPlugin.sh
# Output: build/outputs/sn-tcp-tunnel.snplg
```

To release: push a tag `v*` — GitHub Actions builds and attaches the `.snplg` file
to the release automatically.

To add a language: extend the `translations` object in [`src/i18n.ts`](src/i18n.ts).

</details>

---

## License

MIT © [Gorlix](https://github.com/gorlix) — use freely, share freely.

---

## Credits

Designed and conceived by **[Gorlix](https://github.com/gorlix)** —
vibecoded together with **[Claude Code](https://claude.ai/code)** by Anthropic. 🤖
