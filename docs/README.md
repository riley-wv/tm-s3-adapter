# Documentation

This documentation set is written for an open source, self-hosted audience.

Read in this order if you are new to the project:

1. [Setup guide](./SETUP.md)
2. [Configuration reference](./CONFIGURATION.md)
3. [Architecture](./ARCHITECTURE.md)
4. [Operations guide](./OPERATIONS.md)
5. [Security guide](./SECURITY.md)
6. [API reference](./API.md)
7. [Development guide](./DEVELOPMENT.md)

Additional deployment and roadmap material:

- [Hybrid access deployment](./HYBRID_ACCESS.md)
- [Open source and future cloud offering](./CLOUD_OFFERING.md)

## Documentation goals

The docs should let a new operator or contributor:

- understand what the project is for
- install and run it locally or on a VPS
- configure storage, shares, and access control
- troubleshoot production issues
- contribute changes without hidden internal context

## Current implementation caveat

Centralized users are usable today for local centrally managed access. OIDC and LDAP/Active Directory are represented in configuration and data models, but full end-to-end provider-backed live auth flows are not fully complete yet.
