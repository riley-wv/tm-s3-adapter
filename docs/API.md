# API Reference

There are two API surfaces:

- Admin API: `/admin/api/*` (session cookie auth)
- Public API: `/api/*` (bearer token auth)

Health endpoint is unauthenticated:

- `GET /health`

## Authentication

### Admin API auth (session)

1. Login:

```http
POST /admin/api/login
Content-Type: application/json

{"username":"admin","password":"..."}
```

2. Use returned cookie (`tm_admin_session`) for further admin requests.

3. Logout:

- `POST /admin/api/logout`

4. Session status:

- `GET /admin/api/session`

### Public API auth (bearer)

Include header:

```http
Authorization: Bearer <VPS_API_TOKEN>
```

## Common admin endpoints

- `GET /admin/api/state`
  - Full dashboard state: settings, `settingsConfig` (value/source/locked per dual-source setting), samba/sftp info, mounts, disks, postgres readiness
- `PUT /admin/api/settings`
  - Update global settings (`hostname`, `rootShareName`, `smbPublicPort`, feature toggles, SMB streams backend, mount poll interval, auth/session settings, VPS cache knobs, enterprise/auth/directory/OIDC/postgres settings)
  - Returns HTTP `400` if attempting to update a setting locked by `*_FORCE` env
- `POST /admin/api/setup`
  - Initial setup workflow (same setting coverage as `/admin/api/settings`, plus setup completion)
- `GET /admin/api/samba/status`
  - Samba manager runtime status

## Admin mounts endpoints

- `GET /admin/api/mounts`
- `POST /admin/api/mounts`
  - Required: `name`, `mountPath`
  - Provider-specific fields: S3 credentials/bucket/etc, or rclone remote path
- `PUT /admin/api/mounts/:mountId`
- `POST /admin/api/mounts/:mountId/ensure`
- `POST /admin/api/mounts/:mountId/unmount`
- `DELETE /admin/api/mounts/:mountId`

Mount deletion fails if any disk still references the mount.

## Admin disks endpoints

- `POST /admin/api/disks`
  - Create disk (supports `local`, `cloud-mount`, `cloudmounter/filesystem`)
- `PUT /admin/api/disks/:diskId`
  - Update disk fields and storage mapping
- `POST /admin/api/disks/:diskId/password`
  - Rotate SMB password (custom or auto-generated)
- `POST /admin/api/disks/:diskId/sftp-password`
  - Rotate SFTP password (custom or auto-generated)
- `POST /admin/api/disks/:diskId/apply-samba`
  - Re-apply Samba user/share config
- `POST /admin/api/disks/:diskId/apply-sftp`
  - Re-apply drive-scoped SFTP user/chroot config
- `DELETE /admin/api/disks/:diskId`
  - Body optional: `{"deleteData":true}`

## Admin logs and terminal

- `GET /admin/api/logs`
  - Snapshot of buffered logs
- `GET /admin/api/logs/stream`
  - SSE stream of live logs
- `GET /admin/api/log-tail/sources`
  - List tail-able sources (service logs and visible docker containers)
- `GET /admin/api/log-tail/stream?source=<id>&lines=<n>`
  - SSE tail stream

Terminal session API:

- `POST /admin/api/terminal/sessions`
- `GET /admin/api/terminal/sessions/:sessionId`
- `GET /admin/api/terminal/sessions/:sessionId/stream` (SSE)
- `POST /admin/api/terminal/sessions/:sessionId/input`
- `DELETE /admin/api/terminal/sessions/:sessionId`

## Public API endpoints

- `GET /api/disks`
  - List disks metadata
- `POST /api/disks`
  - Create disk (same storage model semantics)
- `DELETE /api/disks/:diskId`
  - Optional body `{"deleteData":true|false}` (defaults to true)
- `GET /api/smb`
  - Root SMB details and disk URLs
- `GET /api/sftp`
  - Root SFTP details and per-disk drive URLs
- `GET /api/disks/:diskId/files?prefix=...`
  - Recursive file listing
- `PUT /api/disks/:diskId/file?path=<rel>&mtimeMs=<ms>`
  - Write file body stream
- `GET /api/disks/:diskId/file?path=<rel>`
  - Read file stream
- `DELETE /api/disks/:diskId/file?path=<rel>`

## cURL examples

### Login to admin API

```bash
curl -i \
  -X POST http://127.0.0.1:8787/admin/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
```

### Read admin state with session cookie

```bash
curl -sS \
  http://127.0.0.1:8787/admin/api/state \
  -H 'cookie: tm_admin_session=<TOKEN>' | jq
```

### List disks via public API

```bash
curl -sS \
  http://127.0.0.1:8788/api/disks \
  -H 'authorization: Bearer YOUR_API_TOKEN' | jq
```

### Upload a file into a disk

```bash
curl -sS \
  -X PUT "http://127.0.0.1:8788/api/disks/<disk-id>/file?path=test.bin" \
  -H 'authorization: Bearer YOUR_API_TOKEN' \
  --data-binary @./test.bin
```

## Notes

- Admin sessions are in-memory only and are cleared on service restart.
- Dual-source settings precedence is: `*_FORCE` env -> UI value -> `*_DEFAULT` env -> app default.
- Setup/settings config persistence requires Postgres to be enabled and configured.
- Many admin/public write operations return HTTP `409` for ID/name conflicts.
- Mount and Samba operations can fail with actionable error messages; inspect `/admin/api/state` runtime sections for details.
