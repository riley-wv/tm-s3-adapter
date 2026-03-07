# Hybrid Access Guide

This runbook keeps Cloudflare Tunnel for SSH and the admin surfaces while exposing SMB and SFTP directly from the VPS.

## Target state

- Tunnel-only:
  - `ssh.root-vps.bhs-ca.servers.webbventures.com.au`
  - `admin.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au`
  - `api.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au`
- Direct DNS to VPS public IP:
  - `smb.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au`
  - `sftp.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au`

## 1. Back up current state

```bash
cp .env .env.bak.$(date +%Y%m%d-%H%M%S)
cp data/vps/metadata.json data/vps/metadata.json.bak.$(date +%Y%m%d-%H%M%S)
```

If you manage `cloudflared` on the VPS host, also back up:

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%Y%m%d-%H%M%S)
```

## 2. Use this Cloudflare Tunnel config on the VPS

Keep only SSH, dashboard, and admin API on the tunnel:

```yaml
tunnel: a8560ca6-a5ba-4622-8fcd-9f87259ebe52
credentials-file: /etc/cloudflared/a8560ca6-a5ba-4622-8fcd-9f87259ebe52.json

ingress:
  - hostname: ssh.root-vps.bhs-ca.servers.webbventures.com.au
    service: ssh://localhost:22

  - hostname: admin.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au
    service: http://localhost:8787

  - hostname: api.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au
    service: http://localhost:8788

  - service: http_status:404
```

Then restart the service on the VPS:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

## 3. Change Cloudflare DNS and Access

- Keep `ssh.*`, `admin.*`, and `api.*` as tunnel-backed proxied records.
- Change `smb.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au` to `DNS only` and point it to the VPS public IP.
- Change `sftp.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au` to `DNS only` and point it to the VPS public IP.
- Remove or disable any Cloudflare Access application/policy attached to the SMB and SFTP hostnames.

## 4. VPS firewall/security group

Publicly allow:

- `445/tcp`
- `2222/tcp`

Keep closed to the public:

- `22/tcp`
- `8787/tcp`
- `8788/tcp`
- `5432/tcp`

Example `ufw` commands:

```bash
sudo ufw allow 445/tcp
sudo ufw allow 2222/tcp
sudo ufw deny 22/tcp
sudo ufw deny 8787/tcp
sudo ufw deny 8788/tcp
sudo ufw deny 5432/tcp
sudo ufw reload
sudo ufw status numbered
```

If your VPS provider also has a network firewall or security group, mirror the same rules there.

## 5. tm-s3-adapter settings

Set the app hostname to the SMB hostname:

- `hostname = smb.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au`
- `smbPublicPort = 445`
- `VPS_SMB_PORT=445`
- `VPS_SMB_PUBLIC_PORT=445`
- `VPS_SFTP_PORT=2222`

This repo is already configured to keep admin/API on loopback while publishing SMB and SFTP directly.

Important limitation: the app currently uses a single stored hostname for generated SMB and SFTP URLs. SMB URLs will be correct. For SFTP, use the manual endpoint:

```text
sftp://<drive-user>@sftp.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au:2222/
```

## 6. Restart the stack

```bash
docker compose up -d
docker compose ps
```

## 7. Validate the cutover

Tunnel-backed checks:

```bash
curl -I https://admin.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au
curl -I https://api.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au
ssh ssh.root-vps.bhs-ca.servers.webbventures.com.au
```

Direct share checks:

```bash
nc -vz smb.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au 445
nc -vz sftp.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au 2222
sftp -P 2222 <drive-user>@sftp.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au
```

macOS Finder / Time Machine:

```text
smb://smb.cloud-drives.root-vps.bhs-ca.servers.webbventures.com.au/<share-name>
```

Negative checks:

- `22`, `8787`, `8788`, and `5432` should not be reachable from the public internet.
- `cloudflared access tcp` should no longer be required for SMB or SFTP clients.
