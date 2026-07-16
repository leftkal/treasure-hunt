# Treasure Hunt Lights Bridge

Local Node bridge for controlling Tapo L530E bulbs from Treasure Hunt events.

The bridge runs on the Raspberry Pi and talks to the bulb over the local network.
No Tapo credentials are stored in this repository.

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
TAPO_EMAIL=<your Tapo account email>
TAPO_PASSWORD=<your Tapo account password>
TAPO_BULB_IPS=192.168.1.71
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

## Events

- `{"type":"entry_unlocked","entry":1}` through `entry:9`
- `{"type":"wrong_code"}`
- `{"type":"final_complete"}`
- `{"type":"idle"}`
- `{"type":"off"}`

## Notes

- The Pi must stay on the same LAN as the bulbs.
- The bulb IPs should be reserved in the router.
- If the Tapo app/firmware requires it, enable Third-Party Compatibility for the bulb.
- A GitHub Pages HTTPS app may not be able to call a local HTTP bridge directly in all browsers. If that blocks us, serve the hunt locally from the Pi or add a Cloudflare Tunnel later.
