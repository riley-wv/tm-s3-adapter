# Security Guide

This guide documents the current security posture for the open source project.

## 1. Default exposure model

The intended default is:

- dashboard on loopback
- admin API on loopback
- Postgres on loopback
- SMB published intentionally
- SFTP published intentionally

Do not widen exposure casually.

## 2. Secrets

Treat these as secrets:

- admin password
- API token
- Postgres password
- legacy share SMB passwords
- legacy share SFTP passwords
- centralized local user passwords
- identity provider client secrets
- directory bind credentials

Do not commit them.

## 3. Authentication model

Current modes:

- break-glass local admin credentials
- centralized local users
- modeled OIDC provider configuration
- modeled LDAP/AD provider configuration

Current limitation:

- only the local centralized user flow is complete enough to rely on fully today

## 4. Authorization model

Authorization is driven by:

- per-share assignments
- users
- groups/workgroups
- protocol-specific access policy

## 5. Network guidance

Recommended:

- SSH tunnel, VPN, or reverse proxy for dashboard/API
- direct SMB and SFTP only when you intentionally need them
- host firewall or cloud security group rules for all public ports

## 6. Filesystem and mount risk

Cloud-mounted paths often behave differently from local Linux filesystems.

Risk areas:

- xattr support
- locking semantics
- durability assumptions
- stale mount state

Time Machine is especially sensitive here.

## 7. Hardening checklist

- set strong secrets in `.env`
- keep admin/API/Postgres private
- restrict public ports to only what you need
- back up metadata
- monitor logs
- review centralized user assignments regularly
- rotate legacy share credentials if still in use

## 8. Open source security posture

This repository should document its security assumptions openly.

If a future hosted/cloud offering is built, it should add operational controls without making the self-hosted security model opaque.
