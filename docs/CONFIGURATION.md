# Configuration Reference

This document explains environment variables, runtime behavior, and storage/network models.

## Environment variables

### Core ports

- `VPS_ADMIN_DASHBOARD_PORT` (default `8787`)
  - Host bind for dashboard and session-auth admin APIs
- `VPS_ADMIN_API_PORT` (default `8788`)
  - Host bind for admin API + bearer-token public API
- `VPS_SMB_PORT` (default `1445` in compose)
  - Host bind mapped to container SMB port 445
- `VPS_SMB_PUBLIC_PORT` (default follows `VPS_SMB_PORT` in compose)
  - Port used in generated SMB URLs; set to client-visible port
- `VPS_SFTP_PORT` (default `2222`)
  - Host bind and internal SSHD port

### Authentication and session

- `VPS_API_TOKEN`
  - Required bearer token for `/api/*`
- `VPS_ADMIN_USERNAME` (default `admin`)
- `VPS_ADMIN_PASSWORD`
- `VPS_ADMIN_SESSION_SECONDS` (default `43200`)

Admin auth is cookie-based (`tm_admin_session`) with in-memory session storage.

### Feature toggles

- `VPS_SAMBA_MANAGE_ENABLED` (default `true` in compose)
  - Enables Samba share user/config management
- `VPS_SAMBA_STREAMS_BACKEND` (default `xattr`)
  - SMB stream backend used in generated shares: `xattr` or `depot`
  - Use `depot` if clients can connect but write operations fail with SMB I/O errors
- `VPS_MOUNT_MANAGE_ENABLED` (default `true` in compose)
  - Enables mount manager actions for cloud mounts
- `VPS_MOUNT_POLL_SECONDS` (default `30`, minimum effective `10`)

### Dual-source settings (UI + env)

Enterprise/security/auth settings support dual-source resolution:

1. `<NAME>_FORCE` (locked, highest priority)
2. UI-saved value (dashboard setup/settings)
3. `<NAME>_DEFAULT` (environment default)
4. App default

Examples:

- `VPS_ENTERPRISE_FEATURES_ENABLED_DEFAULT` / `VPS_ENTERPRISE_FEATURES_ENABLED_FORCE`
- `VPS_ADMIN_AUTH_MODE_DEFAULT` / `VPS_ADMIN_AUTH_MODE_FORCE`
- `VPS_SMB_AUTH_MODE_DEFAULT` / `VPS_SMB_AUTH_MODE_FORCE`
- `VPS_SFTP_AUTH_MODE_DEFAULT` / `VPS_SFTP_AUTH_MODE_FORCE`
- `VPS_SECURITY_IP_ALLOWLIST_DEFAULT` / `VPS_SECURITY_IP_ALLOWLIST_FORCE`
- `VPS_OIDC_ISSUER_DEFAULT` / `VPS_OIDC_ISSUER_FORCE`
- `VPS_DIRECTORY_URL_DEFAULT` / `VPS_DIRECTORY_URL_FORCE`
- `VPS_MOUNT_POLICY_MODE_DEFAULT` / `VPS_MOUNT_POLICY_MODE_FORCE`

When a `*_FORCE` value is present, the dashboard shows that field as locked and read-only.

### Postgres config store (required)

Setup/settings configuration is stored in Postgres for all setups (local and enterprise).

- `VPS_POSTGRES_ENABLED_DEFAULT` / `VPS_POSTGRES_ENABLED_FORCE`
- `VPS_POSTGRES_HOST_DEFAULT` / `VPS_POSTGRES_HOST_FORCE`
- `VPS_POSTGRES_PORT_DEFAULT` / `VPS_POSTGRES_PORT_FORCE`
- `VPS_POSTGRES_DATABASE_DEFAULT` / `VPS_POSTGRES_DATABASE_FORCE`
- `VPS_POSTGRES_USER_DEFAULT` / `VPS_POSTGRES_USER_FORCE`
- `VPS_POSTGRES_PASSWORD_DEFAULT` / `VPS_POSTGRES_PASSWORD_FORCE`
- `VPS_POSTGRES_SSL_MODE_DEFAULT` / `VPS_POSTGRES_SSL_MODE_FORCE`

Postgres must be enabled and configured.

### Migration and rollback examples

Enable enterprise via UI:

1. Dashboard -> Settings -> enable enterprise mode
2. Configure Postgres settings
3. Save settings

Enable enterprise via env defaults:

- Set `VPS_ENTERPRISE_FEATURES_ENABLED_DEFAULT=true`
- Set `VPS_POSTGRES_ENABLED_DEFAULT=true` and Postgres connection defaults

Rollback to local mode:

1. Dashboard -> Settings -> set enterprise mode off
2. Ensure admin/SMB/SFTP auth modes are `local`
3. Save settings

Force local fallback via env:

- `VPS_ENTERPRISE_FEATURES_ENABLED_FORCE=false`
- `VPS_ADMIN_AUTH_MODE_FORCE=local`
- `VPS_SMB_AUTH_MODE_FORCE=local`
- `VPS_SFTP_AUTH_MODE_FORCE=local`

### SFTP account

- `VPS_SFTP_USERNAME` (default `tmbackup`)
- `VPS_SFTP_PASSWORD`
- `VPS_SFTP_UID` (default `10000`)
- `VPS_SFTP_GID` (default `10000`)
- Optional `VPS_SFTP_ROOT_PATH` (default `/smb-share` for generated URL)

### Paths and runtime internals

- `VPS_DATA_DIR` (default `/data/vps`)
- `VPS_SMB_SHARE_ROOT` (default `/data/vps/smb-share`)
- `VPS_ADMIN_WEB_ROOT` (default `/app/web/vps-public`)
- `VPS_RUNTIME_LOG_DIR` (default `${VPS_DATA_DIR}/runtime-logs`)

Samba manager internals (advanced):

- `VPS_SAMBA_CONF_DIR`
- `VPS_SAMBA_MAIN_CONF`
- `VPS_SAMBA_GENERATED_CONF`
- `VPS_SAMBA_INCLUDE_LINE`
- `VPS_SAMBA_RESTART_CMD`

SFTP drive manager internals (advanced):

- `VPS_SFTP_MANAGE_ENABLED`
- `VPS_SFTP_GENERATED_CONF`
- `VPS_SFTP_CHROOT_BASE_DIR`
- `VPS_SFTP_DRIVE_DIR_NAME`
- `VPS_SFTP_RESTART_CMD`

Mount manager uses `VPSD_RCLONE_BINARY` as default rclone command.

Optional cache path override:

- `VPS_RCLONE_CACHE_DIR` (default `/data/vps/rclone-vfs-cache`)
  - Persistent on-disk cache used for cloud-mount read/write buffering

### Logs and terminal tuning

- `VPS_LOG_BUFFER_SIZE` (default `2000` log events)
- `VPS_TAIL_DEFAULT_LINES` (default `200`)
- `VPS_TAIL_MAX_LINES` (default `5000`)
- `VPS_TERMINAL_IDLE_MS` (default `1200000`)
- `VPS_TERMINAL_BUFFER_CHARS` (default `300000`)
- `VPS_TERMINAL_SNAPSHOT_CHARS` (default `120000`)
- Optional `VPS_TERMINAL_SHELL`

## Data model and persistence

Main metadata file:

- `${VPS_DATA_DIR}/metadata.json`

Persisted volumes in compose:

- `./data/vps:/data/vps`
- `./data/mnt:/mnt/tm-cloud`
- `./data/rclone:/root/.config/rclone`

Runtime service logs:

- `${VPS_RUNTIME_LOG_DIR}/admin-api.log`
- `${VPS_RUNTIME_LOG_DIR}/samba.log`
- `${VPS_RUNTIME_LOG_DIR}/sftp.log`

## Disk storage modes

- `local`
  - Disk path under `VPS_SMB_SHARE_ROOT/<disk-id>`
- `cloud-mount`
  - Uses `storageMountId`; mount manager can auto-ensure mount before operations
- `cloudmounter` / `filesystem`
  - Legacy/custom explicit path mode (`storagePath` + optional `storageSubdir`)

## Cloud mount providers

- `s3`
  - Uses bucket, credentials, optional endpoint/region/prefix/provider
- `google-drive`
  - Uses rclone remote path (default fallback `gdrive:`)
- `onedrive`
  - Uses rclone remote path (default fallback `onedrive:`)
- `rclone`
  - Generic remote path

Cloud mount settings support:

- `rcloneBinary`
- `vfsCacheMode`
- `dirCacheTime`
- `pollInterval`
- `extraArgs[]`
- `enabled`

## VPS read/write cache behavior (SMB + SFTP to cloud mounts)

For disks using `cloud-mount`, SMB and SFTP I/O goes through rclone VFS cache on the VPS.
These controls are configured in Dashboard -> Settings:

- `vpsCacheEnabled` (default `true`)
- `vpsCacheDir` (default `/data/vps/rclone-vfs-cache`)
- `vpsWriteBackSeconds` (default `120`)
- `vpsCacheMaxSizeGb` (default `1`)
- `vpsCacheMaxAgeHours` (default `24`)
- `vpsReadAheadMb` (default `16`)

When enabled, the mount manager applies:

- `--vfs-cache-mode full`
- `--vfs-write-back <seconds>`
- `--vfs-cache-max-size <GB>`
- `--vfs-cache-max-age <hours>`
- `--buffer-size <MB>`
- `--cache-dir <vpsCacheDir>/<mount-id>`

Because cache data is stored on the persistent VPS volume (`/data/vps` by default), queued writes survive service restarts and can be flushed after remount.

## Networking and exposure model

Compose binds all services to `127.0.0.1` on the host by default.

This means:

- Safe default: no direct public exposure
- Access via local host, SSH tunnel, reverse proxy, or Cloudflare Tunnel

If external routing changes visible SMB port, set `VPS_SMB_PUBLIC_PORT` so generated SMB URLs remain correct.

## SMB behavior for Time Machine

Generated shares include:

- `fruit:time machine = yes`
- `vfs objects = catia fruit streams_<backend>` (`VPS_SAMBA_STREAMS_BACKEND`, default `xattr`)
- `streams_xattr` uses `fruit:resource = file`, `fruit:metadata = netatalk`, `fruit:locking = netatalk`
- `streams_depot` uses `fruit:resource = stream`, `fruit:metadata = stream`
- `force user = root`
- `force group = root`
- `durable handles = yes`
- Optional quota as `fruit:time machine max size = <n>G`

The root share (`rootShareName`) is also generated when Samba management is enabled, but it is not marked as a Time Machine share.

When `streams_xattr` is selected, the adapter now probes the target share path for real xattr support before applying Samba. This works on local Linux filesystems with xattrs enabled, but typically fails on `rclone mount` / FUSE-backed cloud paths, which should use `streams_depot` instead.

## Production hardening checklist

- Set strong secrets for admin/API/SFTP in `.env`
- Keep enterprise mode disabled unless you need it
- If using env locks (`*_FORCE`), document ownership and change process
- Restrict host access; keep loopback binds unless intentionally exposing
- Use Cloudflare Access or another auth layer for web/admin exposure
- Rotate SMB disk passwords periodically
- Back up metadata and rclone config regularly
