# tm-s3-adapter

VPS-first Time Machine adapter running in a single Docker container.

The container exposes 4 ports:
- Admin Dashboard (web UI)
- Admin API
- SMB Server
- SFTP Server

Supported storage backends:
- S3 and S3-compatible APIs
- Google Drive (via rclone remote)
- OneDrive (via rclone remote)

## Quick start (local machine or VPS)

1. Copy env template:

```bash
cp .env.example .env
```

2. Set strong secrets in `.env`:
- `VPS_ADMIN_PASSWORD`
- `VPS_API_TOKEN`
- `VPS_SFTP_PASSWORD`

3. Start:

```bash
npm run docker:up
```

4. Open:
- Dashboard: `http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/admin`
- Admin API base: `http://127.0.0.1:${VPS_ADMIN_API_PORT:-8788}/admin/api`
- SMB: `smb://127.0.0.1:${VPS_SMB_PORT:-1445}`
- SFTP: `sftp://127.0.0.1:${VPS_SFTP_PORT:-2222}`

Stop:

```bash
npm run docker:down
```

## Host requirements for cloud drives

- Docker host must provide `/dev/fuse` (Linux kernel FUSE support).
- Compose already enables the required `SYS_ADMIN` capability and `/dev/fuse` mapping.
- On non-Linux desktop Docker environments, cloud mounts may be limited by the VM runtime.

## Port model

`docker-compose.yml` maps host ports to container ports:
- Dashboard: `host VPS_ADMIN_DASHBOARD_PORT -> container 8787`
- Admin API: `host VPS_ADMIN_API_PORT -> container 8788`
- SMB: `host VPS_SMB_PORT (default 1445 for local macOS) -> container 445`
- SFTP: `host VPS_SFTP_PORT -> container 2222`

This is the same deployment model for both local development and VPS hosting.
If external routing changes the visible SMB port, set `VPS_SMB_PUBLIC_PORT` so generated SMB URLs use the reachable port.

## Cloud mounts

Create mounts from the Admin Dashboard:
- `s3`: use bucket + keys + endpoint/region for S3-compatible providers.
- `google-drive`: uses rclone remote path (defaults to `gdrive:`).
- `onedrive`: uses rclone remote path (defaults to `onedrive:`).
- `rclone`: custom remote path.

Notes:
- Google Drive / OneDrive require rclone auth setup in the container.
- If you need interactive rclone setup, run:

```bash
docker exec -it tm-adapter-vps rclone config
```

The rclone config is persisted in:
- `./data/rclone -> /root/.config/rclone`

## Time Machine workflow

1. Open dashboard and log in.
2. Create a Cloud Mount for your backend (`s3`, `google-drive`, `onedrive`, or `rclone`).
3. Create a Drive with:
- `storageMode=cloud-mount` (or `local` if you want local-only disk storage).
- `applySamba=true`.
4. Use the generated SMB credentials (`smbUsername`, `smbPassword`, `diskShareUrl`).
5. On macOS, connect in Finder (Go -> Connect to Server) using `diskShareUrl`.
   - For local Docker use, ensure the URL includes your mapped SMB port (default `:1445`).
6. In Time Machine settings, select that mounted SMB share as the backup disk.

Implementation details for Time Machine compatibility:
- Samba share is marked with `fruit:time machine = yes`.
- Per-drive quotas are exposed as `fruit:time machine max size` when `quotaGb > 0`.
- SMB writes are forced to root within the share path to avoid permission failures on mounted cloud filesystems.
- Generated drive shares also include Apple fruit options such as `fruit:metadata = stream` and `fruit:posix_rename = yes` so host-managed Samba installs do not depend on global defaults.

If backups still fail after selecting the disk:
- Prefer SMB on port `445` on real VPS deployments (`VPS_SMB_PORT=445`, `VPS_SMB_PUBLIC_PORT=445`).
- Verify your backing filesystem supports xattrs/streams; `streams_xattr` is required for reliable Time Machine behavior.
- Test with a `local` storage-mode drive first. If local works but cloud-mount fails, the mount backend is the limiting factor.

## Admin/API auth

- Dashboard and `/admin/api/*` use session login (`VPS_ADMIN_USERNAME` / `VPS_ADMIN_PASSWORD`).
- `/api/*` requires bearer token:

```http
Authorization: Bearer <VPS_API_TOKEN>
```

## Data locations

Persistent volumes:
- `./data/vps -> /data/vps`
- `./data/mnt -> /mnt/tm-cloud`

Metadata and share data are stored under `/data/vps`.

## Scripts

- `npm run vpsd`: run Node service directly
- `npm run dashboard:dev`: run Next.js admin dashboard in dev mode (`web/dashboard`)
- `npm run dashboard:build`: export Next.js dashboard into `web/vps-public`
- `npm run admin:build`: alias for `dashboard:build`
- `npm run docker:up`: build and start container
- `npm run docker:down`: stop container
- `npm test`: run tests
