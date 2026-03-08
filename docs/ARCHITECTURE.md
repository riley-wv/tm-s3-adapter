# Architecture

This document explains how the project is structured today and how to think about it as an open source system.

## 1. System overview

The project acts as a control plane and protocol gateway on one VPS.

Main responsibilities:

- store configuration and share metadata
- mount cloud storage when needed
- generate Samba configuration
- generate SFTP access configuration
- expose a dashboard and API

## 2. Runtime components

### Main daemon

File:

- `/src/vpsd/index.mjs`

Responsibilities:

- HTTP server
- admin and public APIs
- metadata normalization
- settings persistence
- share lifecycle orchestration

### Samba manager

File:

- `/src/vpsd/sambaManager.mjs`

Responsibilities:

- create Samba users
- generate share config
- reload Samba
- enforce Time Machine-specific flags only when requested

### SFTP manager

File:

- `/src/vpsd/sftpManager.mjs`

Responsibilities:

- create local users for SFTP
- generate chroot and bind-mount layout
- update SSHD match config

### Cloud mount manager

File:

- `/src/vpsd/cloudMountManager.mjs`

Responsibilities:

- create and monitor rclone mounts
- apply cache policy
- remount or recover from broken mount state

### Shared utilities

Directory:

- `/src/shared`

Responsibilities:

- JSON and Postgres-backed storage
- HTTP helpers
- shell command execution
- filesystem safety helpers

## 3. Data model

Primary stored collections:

- `settings`
- `cloudMounts`
- `disks`
- `users`
- `groups`
- `identityProviders`
- `groupMappings`

Important terminology:

- `share`
  - the current public-facing model
- `disk`
  - the historical persisted model name

## 4. Share flow

When a share is created:

1. the request is validated
2. the storage path is resolved
3. metadata is persisted
4. the share path is created or verified
5. Samba config may be applied
6. SFTP config may be applied

## 5. Access flow

### Legacy per-share mode

- a share owns its own SMB user
- a share owns its own SFTP user

### Centralized mode

- users and groups are managed separately
- a share holds policy assignments
- generated protocol config is derived from those assignments

Current reality:

- local centralized users are fully practical
- OIDC and LDAP/AD are partly modeled but not fully complete in runtime auth behavior

## 6. Dashboard flow

The dashboard is a static Next.js export served by the main daemon.

Source:

- `/web/dashboard`

Generated output:

- `/web/vps-public`

Do not edit generated output directly unless you are inspecting build artifacts.

## 7. Open source boundaries

The repository should stand on its own without private infrastructure or private documentation.

That means:

- all operator-critical behavior should be documented in this repository
- environment variables should be explained publicly
- setup and troubleshooting should not rely on internal runbooks

## 8. Future cloud offering boundary

A future hosted offering should add:

- hosted control plane UX
- billing, tenancy, provisioning, and lifecycle automation
- managed upgrades and observability

It should not require the open source core to become opaque or private to understand.
