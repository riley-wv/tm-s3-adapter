# Open Source Core And Future Cloud Offering

This project is being documented and shaped as an open source self-hosted core first.

## Open source core

The open source repository should fully document:

- installation
- configuration
- operations
- security assumptions
- API shape
- development workflow

Operators should not need private runbooks to self-host it successfully.

## What a future cloud offering would add

A future hosted version could add:

- hosted control plane
- multi-tenant user and share management
- billing
- managed upgrades
- metrics, alerting, and audit UX
- hosted identity-provider setup workflow
- deployment automation

## What should stay true between OSS and cloud

Both should share the same conceptual model:

- mounts
- shares
- centralized users
- groups/workgroups
- identity providers
- SMB as the primary protocol
- Time Machine as an optional share capability

## What should not happen

The hosted/cloud path should not require:

- private-only architectural knowledge
- undocumented behavior differences in the self-hosted core
- removal of critical operator documentation from the repository

## Current honesty note

The current repository is further along on:

- self-hosted local centralized users
- share lifecycle
- Samba/SFTP generation

than on:

- complete OIDC runtime auth
- complete LDAP/AD runtime auth
- WebDAV
- NFS

That should be stated clearly in both OSS and future cloud-facing documentation.
