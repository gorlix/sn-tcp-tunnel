# sn-TCP-Tunnel

View your Supernote's screen on your PC over USB — no WiFi needed.

Supernote has a built-in screen sharing feature, but it only works over WiFi.
This plugin bridges the gap: it forwards the screen sharing stream through the USB cable you already have plugged in.

---

## How it works

1. You plug the Supernote into your PC via USB
2. Tap the **TCP Tunnel** button on the Supernote
3. Run one command on your PC (`adb forward`)
4. Open a browser and see your Supernote screen live

The plugin acts as a relay: it picks up the screen sharing stream from inside the device and sends it over USB to your PC.

---

## What you need

- A Supernote A5X or A6X with **PluginHost** installed
- A PC with **ADB** installed ([download here](https://developer.android.com/tools/releases/platform-tools))
- A USB cable

That's it — no WiFi, no Android Studio, no extra software.

---

## Install the plugin

1. Go to [Releases](../../releases) and download the latest `plugin.snplg`
2. Copy it to your Supernote (USB or WiFi transfer)
3. On the Supernote, open **PluginHost** → **Install Plugin** → select the file
4. Two new buttons appear in the toolbar: **TCP Tunnel** and **Tunnel Config**

---

## Use it

**Every time you want to view the screen:**

1. Plug Supernote into your PC via USB
2. Tap **TCP Tunnel** on the Supernote — the icon becomes solid (relay is active)
3. On your PC, run:

   ```sh
   adb forward tcp:8080 tcp:8888
   ```

4. Open `http://localhost:8080` in your browser

To stop: tap the button again, or just unplug the cable.

---

## Change the target host or port

The default configuration points to `100.113.43.44:8080` (the Supernote screen sharing address on Tailscale).
If your setup is different:

1. Tap **Tunnel Config** in the toolbar
2. Enter the target host and port
3. Tap **Save**

The screen also shows your device's current WiFi IP for reference.

---

## Build from source

<details>
<summary>Prerequisites</summary>

- Node.js 18+
- JDK 21

```bash
# Arch Linux
sudo pacman -S jdk21-openjdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk

# Android command-line tools (no Android Studio needed)
# Download from https://developer.android.com/studio#command-tools
# Then install SDK Platform 35 + Build-Tools 35.0.0:
sdkmanager "platforms;android-35" "build-tools;35.0.0"

export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

</details>

```bash
npm install
chmod +x buildPlugin.sh && ./buildPlugin.sh
# Output: build/outputs/plugin.snplg
```

To publish a release, push a version tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

GitHub Actions builds the plugin and attaches it to the release automatically.

---

## License

MIT
