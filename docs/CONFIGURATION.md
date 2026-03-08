# Configuration Reference

This document describes the current runtime configuration for the open source project.

## 1. Core model

The main user-facing object is a `share`.

A share combines:

- storage backing
- SMB settings
- optional Time Machine behavior
- optional SFTP access
- an access model

Important related concepts:

- `browse share`
  - optional top-level SMB share
- `legacy-per-share`
  - a share owns its own SMB and SFTP credentials
- `centralized`
  - users and groups are assigned to shares

Compatibility note:

- the repository still persists `disks`
- the API still exposes `disks` as a deprecated alias

## 2. Environment variables

### Service ports

- `VPS_ADMIN_DASHBOARD_PORT`
- `VPS_ADMIN_API_PORT`
- `VPS_SMB_PORT`
- `VPS_SMB_PUBLIC_PORT`
- `VPS_SFTP_PORT`

### Data and web paths

- `VPS_DATA_DIR`
- `VPS_SMB_SHARE_ROOT`
- `VPS_ADMIN_WEB_ROOT`
- `VPS_RUNTIME_LOG_DIR`
- `VPS_RCLONE_CACHE_DIR`

### Authentication and sessions

- `VPS_API_TOKEN`
- `VPS_ADMIN_USERNAME`
- `VPS_ADMIN_PASSWORD`
- `VPS_ADMIN_SESSION_SECONDS`

### Samba

- `VPS_SAMBA_MANAGE_ENABLED`
- `VPS_SAMBA_STREAMS_BACKEND`
- `VPS_SAMBA_CONF_DIR`
- `VPS_SAMBA_MAIN_CONF`
- `VPS_SAMBA_GENERATED_CONF`
- `VPS_SAMBA_INCLUDE_LINE`
- `VPS_SAMBA_RESTART_CMD`

`VPS_SAMBA_STREAMS_BACKEND`:

- `xattr`
  - best when the backing filesystem supports extended attributes
- `depot`
  - safer for many FUSE and cloud-mounted paths

### Mount management

- `VPS_MOUNT_MANAGE_ENABLED`
- `VPS_MOUNT_POLL_SECONDS`
- `VPSD_RCLONE_BINARY`

### SFTP

- `VPS_SFTP_USERNAME`
- `VPS_SFTP_PASSWORD`
- `VPS_SFTP_UID`
- `VPS_SFTP_GID`
- `VPS_SFTP_ROOT_PATH`
- `VPS_SFTP_MANAGE_ENABLED`
- `VPS_SFTP_GENERATED_CONF`
- `VPS_SFTP_CHROOT_BASE_DIR`
- `VPS_SFTP_DRIVE_DIR_NAME`
- `VPS_SFTP_RESTART_CMD`

### Postgres-backed settings persistence

- `VPS_POSTGRES_HOST`
- `VPS_POSTGRES_PORT`
- `VPS_POSTGRES_DATABASE`
- `VPS_POSTGRES_USER`
- `VPS_POSTGRES_PASSWORD`
- `VPS_POSTGRES_SSL_MODE`

## 3. Dual-source settings

Some settings can come from the dashboard or environment variables.

Precedence:

1. `<NAME>_FORCE`
2. dashboard-saved value
3. `<NAME>_DEFAULT`
4. application default

Examples:

- `VPS_ADMIN_AUTH_MODE_DEFAULT`
- `VPS_ADMIN_AUTH_MODE_FORCE`
- `VPS_SMB_AUTH_MODE_DEFAULT`
- `VPS_SMB_AUTH_MODE_FORCE`
- `VPS_SFTP_AUTH_MODE_DEFAULT`
- `VPS_SFTP_AUTH_MODE_FORCE`
- `VPS_OIDC_ISSUER_DEFAULT`
- `VPS_DIRECTORY_URL_DEFAULT`
- `VPS_POSTGRES_HOST_DEFAULT`

The environment variable names still use some historical naming such as `enterpriseFeaturesEnabled`. That is legacy naming in the config surface, not a separate private product tier.

## 4. Persisted metadata

The main metadata file is:

- `${VPS_DATA_DIR}/metadata.json`

High-level stored objects:

- `settings`
- `cloudMounts`
- `disks`
- `users`
- `groups`
- `identityProviders`
- `groupMappings`

The application normalizes older metadata into the current share model on load.

## 5. Share settings

Each share can include:

- `name`
- `storageMode`
- `storageMountId`
- `storagePath`
- `smbShareName`
- `timeMachineEnabled`
- `timeMachineQuotaGb`
- `accessMode`
- `accessPolicy`

`accessMode`:

- `legacy-per-share`
- `centralized`

`accessPolicy` is split by protocol:

- `smb.userIds`
- `smb.groupIds`
- `sftp.userIds`
- `sftp.groupIds`

## 6. Storage modes

### `local`

Storage path is created under:

- `VPS_SMB_SHARE_ROOT/<share-id>`

### `cloud-mount`

The share points at a managed mount created through the dashboard or API.

### `cloudmounter` / `filesystem`

The share points at an explicit existing filesystem path.

## 7. Supported cloud providers

Managed mount providers:

- `s3`
- `google-drive`
- `onedrive`
- `rclone`

Relevant provider fields:

- `remotePath`
- `mountPath`
- `bucket`
- `prefix`
- `region`
- `endpoint`
- `accessKeyId`
- `secretAccessKey`
- `s3Provider`
- `extraArgs`

## 8. SMB behavior

All SMB shares use a macOS-friendly baseline:

- `vfs objects = catia fruit streams_<backend>`
- fruit metadata/resource configuration
- forced root ownership
- Apple-compatible rename and metadata behavior

Time Machine is optional per share.

When enabled, the app also sets:

- `fruit:time machine = yes`
- `fruit:time machine max size = <n>G` when quota is set
- additional durable-handle behavior needed for Time Machine

The browse share:

- uses the macOS-friendly baseline
- is never marked as a Time Machine destination

## 9. SFTP behavior

SFTP is the only shipped secondary protocol in the current open source release.

Legacy mode:

- each share gets its own SFTP user
- each user is chrooted into the share path

Centralized mode:

- centralized protocol users can be assigned to multiple shares
- the generated SFTP view exposes only the shares assigned to that user

Deferred:

- WebDAV
- NFS

## 10. Centralized identity

Current modeled entities:

- users
- groups
- identity providers
- group mappings

Current provider categories:

- local
- OIDC
- LDAP / Active Directory

Current implementation reality:

- local centralized users are usable today
- OIDC and LDAP/AD are represented in configuration and policy
- their full runtime authentication flow is not fully complete yet

## 11. Cache behavior

For cloud-mounted shares, VPS-side cache settings apply to SMB and SFTP traffic.

Main settings:

- `vpsCacheEnabled`
- `vpsCacheDir`
- `vpsWriteBackSeconds`
- `vpsCacheMaxSizeGb`
- `vpsCacheMaxAgeHours`
- `vpsReadAheadMb`

## 12. Networking model

The default compose model keeps:

- dashboard on loopback
- admin/public API on loopback
- Postgres on loopback

and publishes:

- SMB
- SFTP

This is intentional and should remain the default documented posture for open source self-hosting.

## 13. Recommended production defaults

- keep admin/API/Postgres off the public internet
- expose SMB and SFTP only if you need them
- use strong secrets
- prefer `depot` on cloud/FUSE-backed shares
- validate Time Machine on a local share before assuming cloud-backed reliability
- back up metadata and rclone config regularly
