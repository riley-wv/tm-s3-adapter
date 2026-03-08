# tm-s3-adapter

`tm-s3-adapter` is an open source VPS-first share gateway for mounting storage on one Linux host and publishing it through controlled access protocols.

Today the project supports:

- SMB shares
- Optional Time Machine mode per SMB share
- SFTP as a secondary access protocol
- Local storage paths
- S3 and S3-compatible object storage
- Google Drive, OneDrive, and other rclone-backed remotes

The product direction is:

- open source self-hosted core first
- strong support for direct VPS deployments
- a future hosted/cloud offering layered on top of the same core concepts

## Current status

The repository already supports:

- share-first management in the dashboard and API
- local and cloud-backed storage mappings
- centralized users, groups, and identity-provider configuration
- legacy per-share SMB and SFTP credentials for compatibility
- per-share Time Machine toggles instead of a Time Machine-only product model

Important implementation note:

- Local centralized users are wired into generated protocol access today.
- OIDC and LDAP/Active Directory are modeled and configurable, but full live authentication flows are not fully wired end to end yet.

## Who this is for

- operators who want one VPS to aggregate multiple storage backends
- macOS users who want SMB shares and optional Time Machine support
- teams that want centralized access control in front of mounted storage
- contributors who want a self-hosted open source storage gateway foundation

## Documentation

- [Documentation index](./docs/README.md)
- [Setup guide](./docs/SETUP.md)
- [Configuration reference](./docs/CONFIGURATION.md)
- [API reference](./docs/API.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Operations guide](./docs/OPERATIONS.md)
- [Security guide](./docs/SECURITY.md)
- [Development guide](./docs/DEVELOPMENT.md)
- [Hybrid access deployment](./docs/HYBRID_ACCESS.md)
- [Open source and future cloud offering](./docs/CLOUD_OFFERING.md)

## Quick start

```bash
cp .env.example .env
npm run docker:up
```

Then open:

- Dashboard: `http://127.0.0.1:${VPS_ADMIN_DASHBOARD_PORT:-8787}/admin`
- Admin API: `http://127.0.0.1:${VPS_ADMIN_API_PORT:-8788}/admin/api`

## Validation commands

- `npm test`
- `npm run dashboard:build`
- `npm run docker:up`

## Compatibility policy

The project has moved from a `disk` model to a `share` model.

For compatibility:

- `shares` is the primary API object
- `disks` still exists as a deprecated alias
- legacy per-share credentials still exist while centralized access is adopted

## Open source posture

This repository should be understandable and operable without any private company context. The documentation is written for public contributors and self-hosting operators first.
