# Setup Guide

This guide covers end-to-end setup for a new host, first login, first drive, and first Time Machine backup.

## 1. Prerequisites

- Linux VPS or local Linux machine
- Docker Engine + Docker Compose plugin
- Host-level FUSE support (`/dev/fuse`)
- macOS client for Time Machine testing
- Optional: domain + Cloudflare account (only if using tunnel)

Check prerequisites:

```bash
docker --version
docker compose version
ls -l /dev/fuse
```

## 2. Clone and prepare environment

```bash
git clone <your-repo-url> tm-s3-adapter
cd tm-s3-adapter
cp .env.example .env
```

Edit `.env` and set secure values:

```dotenv
VPS_API_TOKEN=<long-random-token>
VPS_ADMIN_PASSWORD=<long-random-password>
VPS_SFTP_PASSWORD=<long-random-password>
VPS_POSTGRES_PASSWORD=<long-random-password>
```

Recommended for local macOS Docker usage:

```dotenv
VPS_SMB_PORT=1445
VPS_SMB_PUBLIC_PORT=1445
```

Recommended for real VPS + standard SMB clients:

```dotenv
VPS_SMB_PORT=445
VPS_SMB_PUBLIC_PORT=445
```

## 3. Start services

```bash
npm run docker:up
```

Confirm container is healthy:

```bash
docker compose ps
docker logs --tail=120 tm-adapter-vps
curl -fsS http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/health | jq
```

Expected `/health` response includes `ok: true` plus Samba and mount-manager status.

## 4. First admin login and setup

Open dashboard:

- `http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/admin`

Login defaults from env:

- Username: `VPS_ADMIN_USERNAME` (default `admin`)
- Password: `VPS_ADMIN_PASSWORD`

Complete initial setup values:

- `hostname`: external hostname clients should use
- `rootShareName`: root SMB share name (default `timemachine`)
- `smbPublicPort`: port embedded in generated SMB URLs

The setup call stores values in metadata and can apply root Samba share config.

Optional enterprise onboarding:

- You can enable enterprise mode during onboarding.
- Every enterprise setting is also available later in Dashboard -> Settings.
- If a setting is provided via `*_FORCE` env var, the UI will show it as locked/read-only.
- Setup/settings config is stored in Postgres, so Postgres must be configured.

## 5. Create your first drive (local mode)

In dashboard, create a drive:

- `name`: human-readable label
- `storageMode`: `local`
- `quotaGb`: optional per-drive cap
- `applySamba`: enabled

This generates:

- SMB share name
- SMB username/password
- `diskShareUrl` and root/subdir URLs

## 6. Connect from macOS Finder

1. Finder -> Go -> Connect to Server
2. Enter `diskShareUrl` from dashboard
3. Authenticate with generated SMB credentials
4. Open System Settings -> General -> Time Machine
5. Select the mounted SMB share as backup disk

If prompted repeatedly for credentials, rotate the drive SMB password in dashboard and reconnect.

## 7. Configure cloud-backed storage (optional)

### S3 / S3-compatible

Create a cloud mount with:

- `provider`: `s3`
- `bucket`
- `accessKeyId`
- `secretAccessKey`
- Optional: `endpoint`, `region`, `prefix`, `s3Provider`

Then create a drive with:

- `storageMode`: `cloud-mount`
- `storageMountId`: selected mount

### Google Drive / OneDrive

1. Configure rclone interactively:

```bash
docker exec -it tm-adapter-vps rclone config
```

2. Create mount:

- `provider`: `google-drive` or `onedrive`
- `remotePath`: e.g. `gdrive:` or `onedrive:`
- `mountPath`: local mount point under `/mnt/tm-cloud/...`

3. Create drive using `storageMode=cloud-mount` and that mount ID.

## 8. Operational checks

- Dashboard state: `GET /admin/api/state`
- Runtime logs stream: `GET /admin/api/logs/stream`
- Tailed service/container logs: `GET /admin/api/log-tail/stream?source=...`
- Samba manager status: `GET /admin/api/samba/status`

See full endpoint details in [API.md](./API.md).

## 9. Upgrades

```bash
git pull
npm run docker:up
```

`docker compose up -d --build` recreates the container while keeping mounted data directories.

## 10. Data persistence and backup

Persisted host directories:

- `./data/vps` -> metadata + SMB share tree + runtime logs
- `./data/mnt` -> cloud mount targets
- `./data/rclone` -> rclone remotes/config

At minimum, back up:

- `./data/vps/metadata.json`
- `./data/rclone/rclone.conf`

## 11. Troubleshooting

### Cloud mount fails to mount

- Verify FUSE exists on host: `ls -l /dev/fuse`
- Check mount manager errors in dashboard state
- Run container logs: `docker logs tm-adapter-vps`
- For S3, validate endpoint/region/credentials

### Time Machine cannot complete backup

- Use SMB port 445 where possible in production
- Validate xattrs/streams support (`streams_xattr`)
- If clients can connect but all writes fail with I/O errors, set `VPS_SAMBA_STREAMS_BACKEND=depot` and restart the container
- Test a `local` drive first to isolate cloud mount issues

### Cannot access dashboard/API

- Confirm loopback port mapping in `docker-compose.yml`
- Confirm tunnel/proxy target (if used) points to host loopback ports

### Enterprise mode fails to enable

- Verify Postgres is enabled/configured (host, port, database, user, password).
- Check whether a `*_FORCE` env variable is locking a field you are trying to change in UI.

### SFTP login fails

- Verify `VPS_SFTP_USERNAME` / `VPS_SFTP_PASSWORD`
- Check `sftp.log` under `./data/vps/runtime-logs`
