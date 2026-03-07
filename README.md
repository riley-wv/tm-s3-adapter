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
- [Hybrid access guide: SSH/Admin over Tunnel, SMB/SFTP direct](./docs/HYBRID_ACCESS.md)

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
- SMB: `smb://<your-smb-host>:${VPS_SMB_PUBLIC_PORT:-445}`
- SFTP: `sftp://<drive-user>@<your-sftp-host>:${VPS_SFTP_PORT:-2222}`

Drive creation in the dashboard generates both SMB and drive-scoped SFTP credentials/URLs.

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

`docker-compose.yml` keeps admin/API/Postgres on loopback and publishes SMB/SFTP directly:

- Dashboard: `127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787} -> 8787`
- Admin/Public API: `127.0.0.1:${VPS_ADMIN_API_PORT:-8788} -> 8788`
- SMB: `0.0.0.0:${VPS_SMB_PORT:-1445} -> 445`
- SFTP: `0.0.0.0:${VPS_SFTP_PORT:-2222} -> 2222`
- Postgres: `127.0.0.1:5432 -> 5432`

Use host firewall rules or cloud security groups to allow only SMB (`445/tcp`) and SFTP (`2222/tcp`) publicly. Keep admin/API/SSH/Postgres restricted to tunnel, VPN, or loopback-only access.

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
- `streams_xattr` profile uses `fruit:resource = file`, `fruit:metadata = netatalk`, `fruit:locking = netatalk`
- `streams_depot` profile uses `fruit:resource = stream`, `fruit:metadata = stream`
- `force user = root` and `force group = root`
- Optional quota via `fruit:time machine max size` when `quotaGb > 0`

The generated root share keeps macOS-compatible fruit settings but is not advertised as a Time Machine target.

`streams_xattr` only works when the underlying share path supports real filesystem xattrs. Cloud-mounted paths exposed through `rclone mount` usually do not, so the app now fails fast with a clear error instead of advertising a broken `streams_xattr` setup there.

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
