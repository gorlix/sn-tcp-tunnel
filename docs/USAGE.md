# Usage Guide

## Install on device

1. Download `plugin.snplg` from GitHub Releases
2. Connect Supernote to PC via USB
3. Copy `plugin.snplg` to the device storage
4. On the Supernote, open **PluginHost** → **Install Plugin** → select the file
5. Two buttons appear in the toolbar: **TCP Tunnel** (toggle) and **Tunnel Config**

## Configure target host/port

1. Tap **Tunnel Config** in the toolbar
2. The screen shows:
   - **Device WiFi IP** (read-only) — your Supernote's current IP on WiFi
   - **Target Host** — the remote machine to relay to (default: `100.113.43.44`)
   - **Target Port** — the port on that machine (default: `8080`)
3. Edit as needed and tap **Save**

Configuration is saved to device storage and persists across restarts.

## Start the tunnel

1. Plug Supernote into your PC via USB
2. On the PC, run:

   ```sh
   adb forward tcp:8080 tcp:8888
   ```

3. Tap the **TCP Tunnel** button on the Supernote
   - Icon changes from outline to solid — tunnel is active
   - An ongoing notification appears: `Tunnel active — IP:8888 → host:port`
4. Open `http://localhost:8080` in a browser on the PC

## Stop the tunnel

- **Manual**: tap the **TCP Tunnel** button again — icon returns to outline
- **Automatic**: unplug the USB cable — the plugin detects disconnection and stops the relay

## Notification

While the tunnel is active, a persistent notification shows in the Supernote notification bar:

```text
Tunnel active
IP:8888 → 100.113.43.44:8080
```

This is dismissed automatically when the tunnel stops.

## Port reference

| Port           | Where                 | Purpose               |
|----------------|-----------------------|-----------------------|
| 8888           | Supernote             | TCP relay listen port |
| 8080 (default) | PC (after adb forward)| Browser access port   |
| 8080 (default) | Remote host           | Target service port   |

`adb forward tcp:8080 tcp:8888` maps PC port 8080 → Supernote port 8888 → remote 8080.

## Troubleshooting

**Button doesn't appear**: reinstall the plugin via PluginHost.

**Tunnel active but browser can't connect**: confirm `adb forward` ran after plugging
in USB. Run `adb devices` to verify ADB sees the device.

**WiFi IP shows "—"**: WiFi is disconnected. The tunnel still works over USB
regardless of WiFi state.

**Target unreachable**: verify the remote host is reachable from the Supernote
(e.g., via Tailscale on the device).
