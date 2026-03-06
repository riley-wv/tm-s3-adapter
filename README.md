# tm-s3-adapter

VPS-first Time Machine adapter that runs in one Docker container and exposes:

- Admin dashboard (web UI)
- Admin API
- SMB server (Time Machine target)
- SFTP server

Supported storage backends:

- S3 and S3-compatible APIs
- Google Drive (rclone remote)
- OneDrive (rclone remote)
- Any custom rclone remote path

## Documentation

- [Full setup guide](./docs/SETUP.md)
- [Configuration and environment reference](./docs/CONFIGURATION.md)
- [Admin/Public API reference](./docs/API.md)
- [Optional Cloudflare Tunnel setup (commands labeled Server vs Client)](./docs/CLOUDFLARE_TUNNEL.md)

## Quick start

1. Copy environment template:

```bash
cp .env.example .env
```

2. Edit `.env` and set strong values at minimum:

- `VPS_ADMIN_PASSWORD`
- `VPS_API_TOKEN`
- `VPS_SFTP_PASSWORD`
- `VPS_POSTGRES_PASSWORD`

3. Start:

```bash
npm run docker:up
```

`npm run docker:up` and `npm run docker:down` automatically use `.env` when that file exists.

4. Open:

- Dashboard: `http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/admin`
- Admin API: `http://127.0.0.1:${VPS_ADMIN_API_PORT:-8788}/admin/api`
- SMB: `smb://127.0.0.1:${VPS_SMB_PORT:-1445}`
- SFTP: `sftp://127.0.0.1:${VPS_SFTP_PORT:-2222}`

5. Health check:

```bash
curl -fsS "http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/health"
```

6. Stop:

```bash
npm run docker:down
```

## Host requirements

- Linux host with Docker and Docker Compose plugin.
- `/dev/fuse` available on the host.
- Compose file already sets required container options:
  - `cap_add: SYS_ADMIN`
  - `/dev/fuse:/dev/fuse`

If FUSE is not available, cloud mounts will fail, but local-mode disks can still work.

## Port model

`docker-compose.yml` binds host loopback ports to container ports:

- Dashboard: `127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787} -> 8787`
- Admin/Public API: `127.0.0.1:${VPS_ADMIN_API_PORT:-8788} -> 8788`
- SMB: `127.0.0.1:${VPS_SMB_PORT:-1445} -> 445`
- SFTP: `127.0.0.1:${VPS_SFTP_PORT:-2222} -> 2222`

Services are intentionally local-only at the host level. Publish them externally with a reverse proxy or Cloudflare Tunnel if needed.

## Cloud mounts and rclone

Google Drive and OneDrive mounts depend on rclone config inside the container.

Interactive setup:

```bash
docker exec -it tm-adapter-vps rclone config
```

Persistent rclone config path:

- Host: `./data/rclone`
- Container: `/root/.config/rclone`

## Time Machine compatibility behavior

Per generated Samba share:

- `fruit:time machine = yes`
- `vfs objects = catia fruit streams_<backend>` (default backend: `xattr`)
- `force user = root` and `force group = root`
- Optional quota via `fruit:time machine max size` when `quotaGb > 0`

If SMB clients can connect but writes fail with I/O errors, try `VPS_SAMBA_STREAMS_BACKEND=depot`.

If backups fail, prefer validating with a `local` storage-mode disk first, then move to cloud mounts.

For cloud-mounted disks, VPS read/write cache settings (write-back delay, max cache size, cache age, read buffer) are available in Dashboard -> Settings and apply to both SMB and SFTP traffic.

## Optional enterprise settings (UI + env)

- Local username/password auth remains the default.
- Enterprise/security/auth settings can be managed in Dashboard onboarding/settings or through env vars.
- Dual-source precedence is:
  - `<NAME>_FORCE` env (locked)
  - UI-saved value
  - `<NAME>_DEFAULT` env
  - app default
- Enterprise mode is optional; Postgres-backed setup/settings config storage is required.

## Development commands

- `npm run vpsd`: run service directly
- `npm run dashboard:dev`: Next.js dashboard dev mode
- `npm run dashboard:build`: export dashboard to `web/vps-public`
- `npm run admin:build`: alias to dashboard export
- `npm run docker:up`: build and start container
- `npm run docker:down`: stop container
- `npm test`: Node test runner
