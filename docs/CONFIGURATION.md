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
- `VPS_MOUNT_MANAGE_ENABLED` (default `true` in compose)
  - Enables mount manager actions for cloud mounts
- `VPS_MOUNT_POLL_SECONDS` (default `30`, minimum effective `10`)

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

Mount manager uses `VPSD_RCLONE_BINARY` as default rclone command.

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

## Networking and exposure model

Compose binds all services to `127.0.0.1` on the host by default.

This means:

- Safe default: no direct public exposure
- Access via local host, SSH tunnel, reverse proxy, or Cloudflare Tunnel

If external routing changes visible SMB port, set `VPS_SMB_PUBLIC_PORT` so generated SMB URLs remain correct.

## SMB behavior for Time Machine

Generated shares include:

- `fruit:time machine = yes`
- `vfs objects = catia fruit streams_xattr`
- `force user = root`
- `force group = root`
- `durable handles = yes`
- Optional quota as `fruit:time machine max size = <n>G`

The root share (`rootShareName`) is also generated when Samba management is enabled.

## Production hardening checklist

- Set strong secrets for admin/API/SFTP in `.env`
- Restrict host access; keep loopback binds unless intentionally exposing
- Use Cloudflare Access or another auth layer for web/admin exposure
- Rotate SMB disk passwords periodically
- Back up metadata and rclone config regularly
