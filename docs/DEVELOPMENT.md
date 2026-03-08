# Development Guide

This guide is for contributors working on the open source repository.

## 1. Local prerequisites

- Node.js 20+
- npm
- Docker and Docker Compose
- Linux host or Linux-compatible environment for realistic SMB and FUSE behavior

## 2. Common commands

- `npm run vpsd`
- `npm run dashboard:dev`
- `npm run dashboard:build`
- `npm run docker:up`
- `npm run docker:down`
- `npm test`

## 3. Repository map

- `/src/vpsd/index.mjs`
- `/src/vpsd/sambaManager.mjs`
- `/src/vpsd/sftpManager.mjs`
- `/src/vpsd/cloudMountManager.mjs`
- `/src/vpsd/shareAccess.mjs`
- `/src/shared`
- `/web/dashboard`
- `/web/vps-public`
- `/docs`
- `/test`

## 4. Source of truth rules

- edit dashboard source in `/web/dashboard`
- do not hand-edit `/web/vps-public` as the source of truth
- keep docs aligned with behavior
- keep `.env.example` aligned with runtime config

## 5. Testing expectations

Minimum:

- `npm test` for backend/runtime changes
- `npm run dashboard:build` for dashboard changes

Recommended when touching storage or protocols:

- validate a local share manually
- validate a cloud-mounted share manually if applicable

## 6. High-risk areas

- Samba share semantics
- Time Machine settings
- xattr and stream behavior
- SFTP chroot and bind mount logic
- shell command construction
- secret handling

## 7. Contribution standards

Good changes should:

- preserve or improve Time Machine compatibility
- avoid leaking secrets
- keep the loopback-first admin exposure model intact
- keep docs current
- avoid editing generated output as the primary source

## 8. Open source contribution direction

The project should be understandable to outside contributors without private context.

If you change behavior:

- update the relevant docs
- note compatibility impact
- mention whether the change affects the future hosted/cloud path or just the self-hosted core
