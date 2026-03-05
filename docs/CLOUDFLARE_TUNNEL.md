# Optional Cloudflare Tunnel Setup

This setup is optional. `tm-s3-adapter` works fine without Cloudflare Tunnel.

Use this if you want to keep host ports bound to `127.0.0.1` and expose access through Cloudflare Zero Trust.

Every command block below is labeled with where to run it:
- **Server (VPS)** = your DigitalOcean/Linux host
- **Client (Laptop)** = your Mac/desktop used to access the services

## Important notes

- Dashboard/API are HTTP services and map cleanly through Tunnel ingress.
- SMB and SFTP are TCP services. Clients must run `cloudflared access tcp` locally to forward TCP traffic.
- Time Machine over Cloudflare is possible only if the Mac keeps the local TCP forward running while backups execute.
- Tunnel ownership and device WARP org do not have to match. Access is evaluated by the org that owns the tunnel hostname.

## Cross-org Zero Trust pattern (one org hosts, another org device)

Example:

- Tunnel/server org: `Webb Ventures` (owns DNS, tunnel, Access apps)
- Device org: `Greenroom` (laptop remains connected to Greenroom WARP)

This is the recommended model when you do not want to move your laptop between WARP orgs.

### Architecture

```text
Laptop (WARP in Org B) -> HTTPS/TCP to Cloudflare Edge
  -> Access policy in Org A (tunnel owner)
  -> Cloudflare Tunnel in Org A
  -> VPS localhost services
```

### Rules that make cross-org work

- Create and run the tunnel in the server org (`Webb Ventures` in this example).
- Create Access applications in that same server org.
- Authenticate users against identities allowed by server-org Access policies.
- Do not rely on WARP private-network routes for this server.
- Avoid posture rules that require being enrolled in the server org's WARP, unless every client device is enrolled there.

### Server-side checklist (Org A / tunnel owner)

1. Run `cloudflared tunnel login` and choose the server org account.
2. Create tunnel and DNS routes in that org.
3. Configure ingress for admin/api/smb/sftp/ssh hostnames.
4. Create Access Self-hosted apps for those hostnames.
5. Add Allow policies for approved users/groups and require MFA.

### Client-side checklist (Org B device)

1. Keep WARP connected to your normal org (no org switch needed).
2. Use hostname-based access:
   - Browser for HTTP apps (`https://admin...`, `https://api...`)
   - `cloudflared access ssh --hostname ...` for SSH
   - `cloudflared access tcp --hostname ... --url 127.0.0.1:<port>` for SMB/SFTP
3. Complete Access login when prompted for the tunnel owner's org.

### Common failure modes in cross-org deployments

- Access app has a device posture requirement tied to the wrong org.
- User identity is valid in IdP, but not included in the server-org Access allow policy.
- Attempting to use private-network routing (`warp-routing`) instead of hostname + Access for this setup.
- SMB forward is not running continuously during Time Machine backups.

## 1. Choose hostnames

Example hostnames:

- `admin.example.com` -> dashboard (HTTP)
- `api.example.com` -> admin/public API (HTTP)
- `smb.example.com` -> SMB (TCP)
- `sftp.example.com` -> SFTP (TCP)
- Optional `ssh.example.com` -> host SSH

## 2. Install cloudflared on VPS

Follow Cloudflare package instructions for your distro.

Validate installation:

Run on: **Server (VPS)**

```bash
cloudflared --version
```

## 3. Authenticate and create tunnel

Run on: **Server (VPS)**

```bash
cloudflared tunnel login
cloudflared tunnel create tm-adapter
```

This creates tunnel credentials JSON under `~/.cloudflared/`.

## 4. Create DNS routes

Run on: **Server (VPS)**

```bash
cloudflared tunnel route dns tm-adapter admin.example.com
cloudflared tunnel route dns tm-adapter api.example.com
cloudflared tunnel route dns tm-adapter smb.example.com
cloudflared tunnel route dns tm-adapter sftp.example.com
```

## 5. Configure tunnel ingress

Copy sample config and edit values:

Run on: **Server (VPS)**

```bash
mkdir -p ~/.cloudflared
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml
```

Update:

- `tunnel:` name or UUID
- `credentials-file:` path to generated credentials JSON
- Hostnames for your domain
- Local target ports (match your `.env` / compose host ports)

Example mapping (matching defaults):

- `admin.example.com` -> `http://localhost:8787`
- `api.example.com` -> `http://localhost:8788`
- `smb.example.com` -> `tcp://localhost:1445`
- `sftp.example.com` -> `tcp://localhost:2222`

## 6. Run cloudflared as a service

Run on: **Server (VPS)**

```bash
cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## 7. Configure tm-s3-adapter for tunnel-aware URLs

Set in `.env`:

Run on: **Server (VPS)**

```dotenv
VPS_ADMIN_DASHBOARD_PORT=8787
VPS_ADMIN_API_PORT=8788
VPS_SMB_PORT=1445
VPS_SFTP_PORT=2222

# Hostname shown in generated SMB/SFTP URLs
VPS_SMB_PUBLIC_PORT=1445
```

In dashboard Settings, set:

- `hostname`: `smb.example.com` (or your chosen client hostname)
- `smbPublicPort`: client-visible port

Restart adapter after env changes:

Run on: **Server (VPS)**

```bash
npm run docker:up
```

## 8. Client usage

### Dashboard and API

- Open `https://admin.example.com/admin`
- API base at `https://api.example.com`

Protect these routes with Cloudflare Access policies.

### SMB from macOS client

Start local TCP forward on the Mac:

Run on: **Client (Laptop)**

```bash
cloudflared access tcp --hostname smb.example.com --url 127.0.0.1:4455
```

In Finder -> Connect to Server:

- `smb://127.0.0.1:4455/<disk-share-name>`

Keep this `cloudflared` process running while Time Machine is using the share.

### SFTP from client

Start local forward:

Run on: **Client (Laptop)**

```bash
cloudflared access tcp --hostname sftp.example.com --url 127.0.0.1:2222
```

Then connect SFTP client to:

- Host: `127.0.0.1`
- Port: `2222`
- Username/password from `.env`

## 9. Optional SSH over tunnel

If ingress includes SSH, use:

Run on: **Client (Laptop)**

```bash
cloudflared access ssh --hostname ssh.example.com
```

or standard SSH config using ProxyCommand with cloudflared.

## 10. Troubleshooting

- 404 from tunnel hostname:
  - Check `~/.cloudflared/config.yml` ingress order and catch-all rule.
- Access denied:
  - Verify Cloudflare Access policy for user identity.
- SMB connect works but Time Machine fails:
  - Ensure forward process stays alive and SMB URL points to local forwarded port.
- Tunnel healthy but adapter unreachable:
  - Confirm docker ports are bound and listening on VPS loopback.

Check quickly on VPS:

Run on: **Server (VPS)**

```bash
ss -lntp | rg '8787|8788|1445|2222'
curl -fsS http://127.0.0.1:8787/health
```
