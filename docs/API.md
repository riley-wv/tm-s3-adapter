# API Reference

The project exposes:

- an admin API at `/admin/api/*`
- a public API at `/api/*`
- an unauthenticated health endpoint at `/health`

Compatibility note:

- `shares` is the primary object model
- `disks` remains available as a deprecated alias

## 1. Authentication

### Admin API

Session-cookie based:

1. `POST /admin/api/login`
2. use the `tm_admin_session` cookie
3. `POST /admin/api/logout`
4. `GET /admin/api/session`

### Public API

Bearer token:

```http
Authorization: Bearer <VPS_API_TOKEN>
```

## 2. Health

- `GET /health`

Returns basic runtime status.

## 3. Admin API overview

### State and settings

- `GET /admin/api/state`
- `POST /admin/api/setup`
- `PUT /admin/api/settings`
- `GET /admin/api/samba/status`

`/admin/api/state` is the main dashboard bootstrap payload and includes:

- settings
- settings source and lock metadata
- Samba status
- SFTP status
- mount status
- shares
- deprecated disks alias
- users
- groups
- identity providers

### Mounts

- `GET /admin/api/mounts`
- `POST /admin/api/mounts`
- `PUT /admin/api/mounts/:mountId`
- `POST /admin/api/mounts/:mountId/ensure`
- `POST /admin/api/mounts/:mountId/unmount`
- `DELETE /admin/api/mounts/:mountId`

### Shares

Primary endpoints:

- `POST /admin/api/shares`
- `PUT /admin/api/shares/:shareId`
- `POST /admin/api/shares/:shareId/password`
- `POST /admin/api/shares/:shareId/sftp-password`
- `POST /admin/api/shares/:shareId/apply-samba`
- `POST /admin/api/shares/:shareId/apply-sftp`
- `DELETE /admin/api/shares/:shareId`

Compatibility aliases:

- `/admin/api/disks`
- `/admin/api/disks/:diskId`
- matching password/apply/delete routes

### Centralized identity

- `GET /admin/api/users`
- `POST /admin/api/users`
- `PUT /admin/api/users/:userId`
- `DELETE /admin/api/users/:userId`

- `GET /admin/api/groups`
- `POST /admin/api/groups`
- `PUT /admin/api/groups/:groupId`
- `DELETE /admin/api/groups/:groupId`

- `GET /admin/api/identity-providers`
- `POST /admin/api/identity-providers`
- `PUT /admin/api/identity-providers/:providerId`
- `DELETE /admin/api/identity-providers/:providerId`

### Logs and terminal

- `GET /admin/api/logs`
- `GET /admin/api/logs/stream`
- `GET /admin/api/log-tail/sources`
- `GET /admin/api/log-tail/stream`
- `POST /admin/api/terminal/sessions`
- `GET /admin/api/terminal/sessions/:sessionId`
- `GET /admin/api/terminal/sessions/:sessionId/stream`
- `POST /admin/api/terminal/sessions/:sessionId/input`
- `DELETE /admin/api/terminal/sessions/:sessionId`

## 4. Public API overview

Primary endpoints:

- `GET /api/shares`
- `POST /api/shares`
- `DELETE /api/shares/:shareId`
- `GET /api/smb`
- `GET /api/sftp`
- `GET /api/shares/:shareId/files`
- `PUT /api/shares/:shareId/file`
- `GET /api/shares/:shareId/file`
- `DELETE /api/shares/:shareId/file`

Compatibility aliases:

- `GET /api/disks`
- `POST /api/disks`
- `DELETE /api/disks/:diskId`
- `GET /api/disks/:diskId/files`
- `PUT /api/disks/:diskId/file`
- `GET /api/disks/:diskId/file`
- `DELETE /api/disks/:diskId/file`

## 5. Share payload model

A typical share response includes:

```json
{
  "id": "share-1",
  "name": "Archive",
  "storageMode": "local",
  "storagePath": "/data/vps/smb-share/share-1",
  "accessMode": "centralized",
  "smb": {
    "shareName": "archive",
    "url": "smb://server/archive",
    "profile": "mac-share",
    "timeMachineEnabled": false,
    "timeMachineQuotaGb": 0,
    "authMode": "centralized"
  },
  "sftp": {
    "enabled": true,
    "path": "/drive/archive",
    "authMode": "centralized"
  },
  "access": {
    "mode": "centralized",
    "users": [],
    "groups": []
  }
}
```

Legacy fields such as `diskShareUrl`, `smbUsername`, and `sftpUsername` still exist for compatibility where legacy mode is active.

## 6. Common workflows

### Log in to the admin API

```bash
curl -i \
  -X POST http://127.0.0.1:8787/admin/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
```

### Read dashboard state

```bash
curl -sS \
  http://127.0.0.1:8787/admin/api/state \
  -H 'cookie: tm_admin_session=<TOKEN>' | jq
```

### List shares

```bash
curl -sS \
  http://127.0.0.1:8788/api/shares \
  -H 'authorization: Bearer YOUR_API_TOKEN' | jq
```

### Create a local share

```bash
curl -sS \
  -X POST http://127.0.0.1:8787/admin/api/shares \
  -H 'content-type: application/json' \
  -H 'cookie: tm_admin_session=<TOKEN>' \
  -d '{
    "name": "Team Files",
    "storageMode": "local",
    "shareName": "team-files",
    "timeMachineEnabled": false,
    "accessMode": "legacy-per-share"
  }' | jq
```

### Create a centralized local user

```bash
curl -sS \
  -X POST http://127.0.0.1:8787/admin/api/users \
  -H 'content-type: application/json' \
  -H 'cookie: tm_admin_session=<TOKEN>' \
  -d '{
    "username": "alice",
    "displayName": "Alice",
    "authType": "local",
    "password": "replace-me",
    "protocolUsername": "alice",
    "protocolPassword": "replace-me-too",
    "isAdmin": true
  }' | jq
```

### Create a centralized share

```bash
curl -sS \
  -X POST http://127.0.0.1:8787/admin/api/shares \
  -H 'content-type: application/json' \
  -H 'cookie: tm_admin_session=<TOKEN>' \
  -d '{
    "name": "Design Files",
    "storageMode": "local",
    "shareName": "design-files",
    "accessMode": "centralized",
    "accessPolicy": {
      "smb": { "groupIds": ["designers"] },
      "sftp": { "groupIds": ["designers"] }
    }
  }' | jq
```

### Upload a file through the public API

```bash
curl -sS \
  -X PUT "http://127.0.0.1:8788/api/shares/<share-id>/file?path=test.bin" \
  -H 'authorization: Bearer YOUR_API_TOKEN' \
  --data-binary @./test.bin
```

## 7. Current limitations

- `shares` and `disks` coexist during a compatibility window
- centralized local users work today
- OIDC and LDAP/AD are not fully complete as live provider-backed auth flows yet
- WebDAV and NFS are not implemented yet
