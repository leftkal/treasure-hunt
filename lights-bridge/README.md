# Treasure Hunt Lights Bridge

Local Node bridge for controlling Tapo L530E bulbs and Raspberry Pi Bluetooth/BlueALSA sound playback from Treasure Hunt events.

The bridge runs on the Raspberry Pi and talks to the bulbs over the local network.
No Tapo credentials are stored in this repository.
The public app calls the bridge through `https://lights.alexandra-maria-deli.gr`.

## Pi setup

```bash
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git ffmpeg bluez-alsa-utils alsa-utils
```

Copy this `lights-bridge` folder to the Pi, then:

```bash
cd ~/treasure-hunt/lights-bridge
npm install
cp .env.example .env
nano .env
```

Set:

```env
PORT=8787
BRIDGE_TOKEN=<long random secret>
BRIDGE_ALLOWED_ORIGINS=https://your-github-pages-origin.example
TAPO_EMAIL=<your Tapo account email>
TAPO_PASSWORD=<your Tapo account password>
TAPO_BULB_IPS=192.168.1.71,192.168.1.89,192.168.1.229,192.168.1.159
# Optional; defaults to ../sounds relative to lights-bridge.
SOUNDS_DIR=/home/pi/treasure-hunt/sounds
# Optional; defaults to bluealsa.
BLUEALSA_DEVICE=bluealsa
# Optional; defaults to BT-WUZHI's MAC. Empty disables reconnect attempts.
BT_SPEAKER_MAC=02:3C:A2:63:BF:ED
# Optional; defaults to true. Attempts bluetoothctl connect before sounds.
BT_RECONNECT_BEFORE_PLAY=true
# Optional; defaults to 20000. Interval in ms for automatic speaker health checks.
BT_RECONNECT_INTERVAL_MS=20000
```

Generate a token with:

```bash
openssl rand -hex 24
```

Start manually:

```bash
npm start
```

Health check:

```bash
curl http://192.168.1.77:8787/health
```

Test an entry scene:

```bash
curl -X POST http://192.168.1.77:8787/event \
  -H 'Content-Type: application/json' \
  -H 'X-Bridge-Token: <your token>' \
  -d '{"type":"entry_unlocked","entry":1}'
```

Browser calls from any exact origin listed in `BRIDGE_ALLOWED_ORIGINS` may POST `/event` without `X-Bridge-Token`. Keep `BRIDGE_TOKEN` set for manual calls and private testing. Set `BRIDGE_ALLOWED_ORIGINS` to the exact HTTPS origin of the hosted Treasure Hunt app, comma-separated for multiple origins if needed.

## Events

- `{"type":"entry_unlocked","entry":1}` through `entry:9`
- `{"type":"wrong_code"}`
- `{"type":"final_complete"}`
- `{"type":"idle"}`
- `{"type":"off"}`

## Bulb behavior

- Known bulb roles are kitchen `192.168.1.71`, bedroom 1 `192.168.1.89`, living room `192.168.1.229`, and bedroom 2 `192.168.1.159`. Only IPs present in `TAPO_BULB_IPS` are used.
- Temporary and sound-linked light effects use a simple on → red → off sequence. No color restore is written after the bulb turns off.
- Re-triggering the same `entry_unlocked` event clears and restarts pending timed effects for that entry.
- Entry 2 turns on bedroom 1 red after 20 seconds, or kitchen if bedroom 1 is not configured, then turns it off after 2 seconds.
- Entry 3 immediately turns bedroom 2 red, then turns it off after 2 seconds.
- Entry 4 plays `flert1.m4a` after 60 seconds and turns both configured bedroom bulbs red only while the full flert plays.
- Entry 8 plays `flert2.m4a` after 80 seconds with the same both-bedroom red light behavior.
- Entry 8 turns the living-room bulb red while its delayed voice line plays. Entry 9 does the same for its delayed voice line.
- `wrong_code` is intentionally a no-op now; wrong answers do not trigger any bridge light or sound effects.
- `off` turns all bulbs off. `idle`, `wrong_code`, and `final_complete` apply to all bulbs.

## Sound behavior

- Audio is played non-blocking: event responses are not held open while sounds play.
- Sound files are read from `SOUNDS_DIR`, or `../sounds` relative to `lights-bridge` when `SOUNDS_DIR` is not set. On the Pi this is normally `/home/pi/treasure-hunt/sounds`.
- The bridge decodes `.m4a`/`.mp3` with `ffmpeg` and pipes WAV audio to `aplay -D bluealsa` by default. Override the ALSA device with `BLUEALSA_DEVICE` if your BlueALSA setup uses another device name.
- Before each sound, the bridge attempts to reconnect `BT_SPEAKER_MAC` with `bluetoothctl connect` unless `BT_RECONNECT_BEFORE_PLAY=false`.
- While the bridge is running, it also periodically checks the speaker with `bluetoothctl info` and reconnects if it is disconnected. Override the interval with `BT_RECONNECT_INTERVAL_MS` if needed.
- Entries 2, 3, 5, 6, 7, and 9 each schedule one normal ambient sound instead of playing it immediately. Delays are entry 2=10s, entry 3=20s, entry 5=20s, entry 6=50s, entry 7=40s, entry 9=90s. Entries 4 and 8 skip normal ambient sounds because they have flerts. Each normal ambient sound is capped at 7 seconds.
- Normal sounds are all `.m4a`/`.mp3` files in the sounds directory except `flert1.m4a`, `flert2.m4a`, `You are making it to.mp3`, and the spoken voice-line files like `I ve been watching y.mp3`, `The time will come f.mp3`, and `The good thing about.mp3`; files are sorted by name and mapped deterministically to entries 4-9, cycling if there are fewer than six normal files.
- `flert1.m4a` plays 60 seconds after entry 4 starts. `flert2.m4a` plays 80 seconds after entry 8 starts. Both play in full.
- `I ve been watching y.mp3` plays 2.5 minutes after entry 8 starts. `The good thing about.mp3` plays 2 minutes after entry 9 starts. Voice lines are not capped.
- Re-triggering the same entry clears and restarts pending entry light timers and sound timers.
- `You are making it to.mp3` plays when a non-empty bulb result set reports every operation as failed/unavailable, throttled to at most once every 10 minutes.

Quick Pi audio checks:

```bash
ffmpeg -hide_banner -loglevel error -i "/home/pi/treasure-hunt/sounds/flert1.m4a" -f wav - | aplay -D bluealsa
curl -X POST http://192.168.1.77:8787/event \
  -H 'Content-Type: application/json' \
  -H 'X-Bridge-Token: <your token>' \
  -d '{"type":"entry_unlocked","entry":4}'
```

Optional always-on reconnect loop for BT-WUZHI:

```bash
sudo tee /usr/local/bin/bt-wuzhi-reconnect >/dev/null <<'SH'
#!/bin/sh
MAC="02:3C:A2:63:BF:ED"
while true; do
  bluetoothctl info "$MAC" | grep -q "Connected: yes" || bluetoothctl connect "$MAC" >/dev/null 2>&1 || true
  sleep 20
done
SH
sudo chmod +x /usr/local/bin/bt-wuzhi-reconnect
sudo tee /etc/systemd/system/bt-wuzhi-reconnect.service >/dev/null <<'SERVICE'
[Unit]
Description=Keep BT-WUZHI Bluetooth speaker connected
After=bluetooth.service bluealsa.service
Wants=bluetooth.service bluealsa.service

[Service]
Type=simple
ExecStart=/usr/local/bin/bt-wuzhi-reconnect
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
sudo systemctl daemon-reload
sudo systemctl enable --now bt-wuzhi-reconnect.service
```

## Notes

- The Pi must stay on the same LAN as the bulbs.
- The bulb IPs should be reserved in the router.
- If the Tapo app/firmware requires it, enable Third-Party Compatibility for the bulb.
- Use the Cloudflare Tunnel hostname `https://lights.alexandra-maria-deli.gr` for the GitHub Pages app.
