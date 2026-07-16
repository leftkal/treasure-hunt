# Treasure Hunt Lights Bridge

Local Node bridge for controlling Tapo L530E bulbs from Treasure Hunt events.

The bridge runs on the Raspberry Pi and talks to the bulbs over the local network.
No Tapo credentials are stored in this repository.
The public app calls the bridge through `https://lights.alexandra-maria-deli.gr`.

## Pi setup

```bash
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
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

- The first IP in `TAPO_BULB_IPS` is the primary bulb. Normal entry scenes apply to this primary bulb only.
- Additional IPs are special-effect bulbs.
- Re-triggering the same `entry_unlocked` event clears and restarts pending timed effects for that entry.
- Entry 2 turns on the first extra bulb after 20 seconds, then turns it off after 2 seconds.
- Entry 3 immediately turns on the second extra bulb, sets it deep red after 2 seconds, then turns it off after another 2 seconds.
- Entry 4 turns on all configured bulbs and sets them red after 30 seconds.
- `off` turns all bulbs off. `idle`, `wrong_code`, and `final_complete` apply to all bulbs.

## Notes

- The Pi must stay on the same LAN as the bulbs.
- The bulb IPs should be reserved in the router.
- If the Tapo app/firmware requires it, enable Third-Party Compatibility for the bulb.
- Use the Cloudflare Tunnel hostname `https://lights.alexandra-maria-deli.gr` for the GitHub Pages app.
