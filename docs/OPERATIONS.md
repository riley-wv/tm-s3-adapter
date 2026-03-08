# Operations Guide

This guide covers day-2 operations for self-hosted deployments.

## 1. What to monitor

Monitor at least:

- container health
- disk space on the VPS
- rclone mount health
- Samba reload failures
- SFTP reload failures
- Postgres availability

Useful commands:

```bash
docker compose ps
docker logs --tail=200 tm-adapter-vps
curl -fsS http://127.0.0.1:8787/health | jq
```

## 2. What to back up

Required:

- `.env`
- `data/vps/metadata.json`
- `data/rclone/rclone.conf`

Recommended:

- all of `data/vps`
- all of `data/rclone`

## 3. Upgrade procedure

```bash
git pull
npm run docker:up
```

After upgrade:

- check `/health`
- open the dashboard
- validate one local share
- validate one cloud-backed share if you use them

## 4. Troubleshooting sequence

### Storage issues

1. test a local share first
2. then test a cloud-mounted share
3. inspect mount-manager state and logs

### Samba issues

1. inspect generated share config state in the dashboard
2. confirm the streams backend
3. confirm share path exists and is writable
4. reload Samba if needed

### SFTP issues

1. confirm the user exists
2. confirm chroot directories exist
3. confirm bind mounts are present
4. inspect `sftp.log`

## 5. Time Machine validation order

When validating Time Machine behavior:

1. create a local share
2. enable Time Machine on that share
3. validate Finder access
4. validate Time Machine selection
5. only then move to cloud-backed storage

## 6. Log sources

Built-in runtime log sources include:

- admin API
- Samba
- SFTP

The dashboard also exposes a terminal and log-tail tools for operator debugging.

## 7. Recovery notes

### Mount recovery

The app can attempt to recover from stale or broken FUSE mount states by unmounting and remounting once.

### Metadata recovery

If metadata is corrupted:

1. stop the stack
2. restore `data/vps/metadata.json` from backup
3. start the stack
4. validate the dashboard and one known share

### Credential recovery

If using legacy share credentials:

- rotate SMB or SFTP passwords from the dashboard

If using centralized local users:

- update the centralized user entry and re-apply access

## 8. Safe defaults

- keep admin/API/Postgres private
- only expose SMB and SFTP when intentionally needed
- prefer local-share validation before blaming cloud providers
- use `depot` for many cloud-backed Samba workloads
