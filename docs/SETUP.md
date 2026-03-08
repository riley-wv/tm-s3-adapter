# Setup Guide

This guide covers a complete first install of the open source project, from cloning the repository to creating the first share.

## 1. What you are deploying

The current stack is:

- one Node.js service container
- Samba in the same application container
- SFTP/SSH in the same application container
- Postgres for persisted settings
- optional rclone-managed cloud mounts

The project is designed for:

- one Linux VPS
- direct SMB and SFTP access when required
- dashboard and admin API access through loopback, SSH tunnel, VPN, or reverse proxy

## 2. Host prerequisites

Required:

- Linux host
- Docker Engine
- Docker Compose plugin
- `/dev/fuse` available on the host for cloud mounts

Useful checks:

```bash
docker --version
docker compose version
ls -l /dev/fuse
```

If `/dev/fuse` is missing, local shares can still work, but cloud mounts will not.

## 3. Clone the repository

```bash
git clone <your-repo-url> tm-s3-adapter
cd tm-s3-adapter
```

## 4. Create the environment file

```bash
cp .env.example .env
```

At minimum set:

```dotenv
VPS_API_TOKEN=<long-random-token>
VPS_ADMIN_PASSWORD=<long-random-password>
VPS_SFTP_PASSWORD=<long-random-password>
VPS_POSTGRES_PASSWORD=<long-random-password>
```

Recommended defaults for a normal VPS deployment:

```dotenv
VPS_SMB_PORT=445
VPS_SMB_PUBLIC_PORT=445
VPS_SFTP_PORT=2222
```

Recommended defaults for local Docker testing on a laptop:

```dotenv
VPS_SMB_PORT=1445
VPS_SMB_PUBLIC_PORT=1445
VPS_SFTP_PORT=2222
```

## 5. Start the stack

```bash
npm run docker:up
```

Verify:

```bash
docker compose ps
docker logs --tail=120 tm-adapter-vps
curl -fsS http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/health | jq
```

Expected health output includes:

- `ok: true`
- Samba status
- mount manager status

## 6. Open the dashboard

Open:

- `http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/admin`

Default login:

- username: `VPS_ADMIN_USERNAME` or `admin`
- password: `VPS_ADMIN_PASSWORD`

## 7. Complete initial setup

Fill in:

- `hostname`
  - the hostname used for generated SMB URLs
- `browseShareName`
  - optional top-level SMB browse share name
- `browseShareEnabled`
  - whether the browse share should be generated
- `smbPublicPort`
  - the visible client-facing SMB port

Also review:

- `smbStreamsBackend`
- `mountPollSeconds`
- cache settings
- centralized auth settings if you plan to use them

Important:

- The application currently stores one primary hostname for generated URLs.
- If SMB and SFTP use different public hostnames, keep the configured hostname set to the SMB hostname and treat the SFTP hostname as a manual endpoint.

## 8. Create the first share

Go to the Shares tab and create a share with:

- `name`
- `storageMode`
  - `local`
  - `cloud-mount`
  - `cloudmounter`
- `shareName`
- `timeMachineEnabled`
- `timeMachineQuotaGb`
- `accessMode`
  - `legacy-per-share`
  - `centralized`

### If you choose `legacy-per-share`

The app creates:

- one SMB username/password for the share
- one SFTP username/password for the share

### If you choose `centralized`

The share no longer relies on its own per-share protocol identities as the primary access mechanism. Instead:

- assign users directly
- assign groups/workgroups
- apply SMB and SFTP again if needed

## 9. Create centralized users and groups

If you want centralized access:

1. Create one or more groups
2. Create one or more users
3. Add users to groups
4. Assign users and/or groups to shares

The current implementation supports:

- local centralized users end to end
- OIDC provider configuration
- LDAP/AD provider configuration

Current limitation:

- OIDC and LDAP/AD provider-backed live auth flows are not fully wired end to end yet

## 10. Connect from clients

### SMB

Use the share URL shown in the dashboard, for example:

```text
smb://server/share-name
```

### Time Machine

Only use shares with Time Machine mode enabled.

On macOS:

1. Connect to the SMB share in Finder
2. Open System Settings
3. Open Time Machine
4. Select the share as the destination

### SFTP

Use either:

- the legacy per-share SFTP account
- a centralized protocol user that has access to the share

## 11. Add cloud-backed storage

### S3 and S3-compatible

Create a mount with:

- `provider = s3`
- `bucket`
- `accessKeyId`
- `secretAccessKey`
- optional `endpoint`
- optional `region`
- optional `prefix`
- optional `s3Provider`

Then create a share with:

- `storageMode = cloud-mount`
- `storageMountId = <mount-id>`

### Google Drive or OneDrive

Configure rclone first:

```bash
docker exec -it tm-adapter-vps rclone config
```

Then create a mount with:

- `provider = google-drive` or `onedrive`
- `remotePath`
- `mountPath`

Then attach a share to that mount.

## 12. Validate the install

Recommended validation order:

1. Create a local share
2. Confirm SMB access works
3. Confirm SFTP access works
4. If needed, enable Time Machine on that local share
5. Only then move on to cloud mounts

Useful checks:

- `GET /admin/api/state`
- `GET /admin/api/samba/status`
- `GET /admin/api/users`
- `GET /admin/api/groups`
- `GET /admin/api/identity-providers`

## 13. Upgrade workflow

```bash
git pull
npm run docker:up
```

The stack rebuild keeps data in the mounted host directories.

Compatibility behavior during upgrades:

- old `disks` metadata is normalized into shares
- existing Time Machine-oriented shares keep Time Machine enabled
- legacy per-share credentials remain usable until you switch a share to centralized access

## 14. Backups

Back up at least:

- `./data/vps/metadata.json`
- `./data/rclone/rclone.conf`
- your `.env`

Useful full-backup paths:

- `./data/vps`
- `./data/mnt`
- `./data/rclone`

## 15. Common problems

### Cloud mount does not work

- verify `/dev/fuse`
- check mount manager state
- inspect container logs
- test the same workflow with a local share first

### SMB writes fail on cloud-backed shares

- switch `VPS_SAMBA_STREAMS_BACKEND=depot`
- rebuild and restart

### Time Machine is unreliable

- validate the share in local mode first
- keep production SMB on port `445`
- confirm the share has Time Machine enabled
- confirm the share path and streams backend support the required Samba behavior

### Centralized access looks configured but does not work

- confirm the share is in `centralized` access mode
- confirm users or groups are assigned under SMB and/or SFTP access policy
- confirm centralized users have protocol usernames and passwords
- remember that OIDC and LDAP/AD runtime integration is not fully complete yet

### Admin login fails after switching auth mode

- use the break-glass local admin credentials if still enabled
- verify centralized local admin users exist before depending on them
