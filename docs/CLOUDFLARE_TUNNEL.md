# Optional Cloudflare Tunnel Setup

This setup is optional. `tm-s3-adapter` works fine without Cloudflare Tunnel.

Use this if you want to keep host ports bound to `127.0.0.1` and expose access through Cloudflare Zero Trust.

Every command block below is labeled with where to run it:
- **Server (VPS)** = your OVH/Linux host
- **Client (Laptop)** = your Mac/desktop used to access the services

## Important notes

- Dashboard/API are HTTP services and map cleanly through Tunnel ingress.
- SMB and SFTP are TCP services. Clients must run `cloudflared access tcp` locally to forward TCP traffic.
- Time Machine over Cloudflare is possible only if the Mac keeps the local TCP forward running while backups execute.
- Tunnel ownership and device WARP org do not have to match. Access is evaluated by the org that owns the tunnel hostname.
- For permanent behavior, run `cloudflared` as a system service on the VPS and a persistent startup job on the client for SMB forwarding.

## Cross-org Zero Trust pattern (one org hosts, another org device)

Example:

- Tunnel/server org: `Org A` (owns DNS, tunnel, Access apps)
- Device org: `Org B` (laptop remains connected to Org B WARP)

This is the recommended model when you do not want to move your laptop between WARP orgs.

### Architecture

```text
Laptop (WARP in Org B) -> HTTPS/TCP to Cloudflare Edge
  -> Access policy in Org A (tunnel owner)
  -> Cloudflare Tunnel in Org A
  -> VPS localhost services
```

### Rules that make cross-org work

- Create and run the tunnel in the server org (`Org A` in this example).
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

## Operational playbook for secure access goals

This section provides exact steps for the three common goals:

- Auto login to VPS when using Zero Trust
- Deny access to VPS when not using Zero Trust
- Allow access from one Zero Trust org's clients to another Zero Trust org's tunnel apps

### Goal A: Auto login to VPS when using Zero Trust

Target behavior:
- User does not enter Linux account password.
- User connects directly to default `ubuntu` account.
- Cloudflare Access identity check still happens (interactive login only when token/session expires).

#### A1) Configure SSH key auth for `ubuntu`

Run on: **Client (Laptop)**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/webbvps -C "webbvps"
```

Run on: **Server (VPS)**

```bash
sudo mkdir -p /home/ubuntu/.ssh
sudo chmod 700 /home/ubuntu/.ssh
sudo touch /home/ubuntu/.ssh/authorized_keys
sudo chmod 600 /home/ubuntu/.ssh/authorized_keys
sudo chown -R ubuntu:ubuntu /home/ubuntu/.ssh
```

Append the client public key (`~/.ssh/webbvps.pub`) to `/home/ubuntu/.ssh/authorized_keys`.

#### A2) Disable password SSH login on VPS

Run on: **Server (VPS)**

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

#### A3) Configure SSH client for tunnel + default ubuntu user

Run on: **Client (Laptop)**

```bash
cat >> ~/.ssh/config <<'EOF'
Host webbvps
  HostName ssh.vps.example.com
  User ubuntu
  IdentityFile ~/.ssh/webbvps
  IdentitiesOnly yes
  ProxyCommand cloudflared access ssh --hostname %h
EOF
chmod 600 ~/.ssh/config
```

Connect:

Run on: **Client (Laptop)**

```bash
ssh webbvps
```

### Goal B: Deny access to VPS when not using Zero Trust

Target behavior:
- Public internet cannot reach SSH/SMB/SFTP/Admin API directly on VPS IP.
- Only Cloudflare Tunnel path can reach services.

#### B1) Keep services local-only on host

This repo already maps container ports to `127.0.0.1` in `docker-compose.yml`.

#### B2) Block all inbound traffic on VPS

Run on: **Server (VPS)**

```bash
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on lo
sudo ufw enable
sudo ufw status verbose
```

#### B3) Make host SSH tunnel-only

Run on: **Server (VPS)**

```bash
sudo tee /etc/ssh/sshd_config.d/99-tunnel-only.conf >/dev/null <<'EOF'
ListenAddress 127.0.0.1
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo systemctl restart ssh
```

#### B4) Remove direct-DNS exposure

In Cloudflare DNS for your zone:
- Keep only proxied CNAME tunnel hostnames (`*.example.com` -> `<tunnel-id>.cfargotunnel.com`).
- Remove `A`/`AAAA` records that point app hostnames to the OVH public IP.

#### B5) Enforce Access policies

In the tunnel owner's Zero Trust Access organization:
- Create one Self-hosted app per hostname (`ssh`, `admin`, `api`, `smb`, `sftp`).
- Allow only approved identities/groups.
- Require MFA.
- Avoid posture requirements tied only to the tunnel owner's managed WARP if cross-org clients must be supported.

### Goal C: Allow one Zero Trust org's clients to access another org's tunnel apps

Target behavior:
- Laptop stays enrolled in its home Zero Trust org.
- User accesses the tunnel owner's hostnames successfully.
- No private-network route bridging is required.

#### C1) Configure access in tunnel-owner org (Org A)

In Org A Access app policies:
- Include allowed cross-org user identities (emails/groups) in Allow rules.
- Keep authentication at identity + MFA.
- Do not require Org-A-specific device posture for this cross-org pattern.

#### C2) Configure egress in client org (Org B)

If Org B Gateway is restrictive, allow outbound and DNS for:
- `*.example.com`
- `*.cfargotunnel.com`
- `*.cloudflareaccess.com`
- `*.cloudflare.com`
- IdP domains used during login (`accounts.google.com`, `login.microsoftonline.com`, etc.)

If TLS decryption is enabled in Org B, add decryption bypass for:
- `*.example.com`
- `*.cfargotunnel.com`
- `*.cloudflareaccess.com`

#### C2a) SMB store rule type (network vs HTTP)

For SMB access through this tunnel design:

- Keep SMB as a TCP tunnel target (`tcp://localhost:1445`) and client-side `cloudflared access tcp`.
- Do not create direct SMB (port 445) internet allow rules from clients to the VPS IP.
- Do not create an HTTP origin route for SMB; SMB is not exposed as an HTTP service.
- Keep an Access Self-hosted app for `smb.example.com` (identity/MFA policy still applies).
- In DNS policies, allow resolution for `smb.example.com`, `*.cfargotunnel.com`, and `*.cloudflareaccess.com`.
- Keep `smb.example.com` as a proxied Cloudflare DNS record to the tunnel; do not create split-DNS/local overrides to the VPS public IP.
- If Org B uses default-deny network egress, allow `cloudflared` outbound to Cloudflare on port `443` (and optionally UDP `7844` if your environment permits QUIC).
- SMB client traffic itself is local (`smb://127.0.0.1:<forwarded-port>`), so it does not require a separate Gateway HTTP rule.

#### C3) Validate cross-org path

Run on: **Client (Laptop)**

```bash
dig +short ssh.vps.example.com
curl -Iv https://admin.vps.example.com/admin
ssh webbvps
```

Expected:
- DNS resolves to Cloudflare-managed records.
- HTTPS handshake succeeds with a trusted certificate.
- SSH reaches `ubuntu` via `cloudflared` ProxyCommand without Linux password prompt.

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

This makes the VPS tunnel persistent across reboots. You do not need to manually run `cloudflared tunnel run` each time.

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

#### Permanent SMB forward on macOS (launchd)

Use a LaunchAgent so SMB forwarding starts automatically at login and restarts on failure.

Run on: **Client (Laptop)**

```bash
cat > ~/Library/LaunchAgents/com.example.cloudflared.smb.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.cloudflared.smb</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec $(command -v cloudflared) access tcp --hostname smb.example.com --url 127.0.0.1:4455</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/cloudflared-smb.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/cloudflared-smb.err.log</string>
</dict>
</plist>
EOF

launchctl unload ~/Library/LaunchAgents/com.example.cloudflared.smb.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.example.cloudflared.smb.plist
launchctl list | grep com.example.cloudflared.smb
```

If authentication expires:
- Re-run `cloudflared access login https://smb.example.com`.
- Restart the LaunchAgent:

Run on: **Client (Laptop)**

```bash
launchctl unload ~/Library/LaunchAgents/com.example.cloudflared.smb.plist
launchctl load ~/Library/LaunchAgents/com.example.cloudflared.smb.plist
```

For fewer re-auth prompts, set a longer Access session duration on the SMB Access app policy.

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
