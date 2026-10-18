# Architecture Diagram

**Replaced.** This file held a hand-drawn diagram of the first prototype
(SMTP only, Azure Blob storage, no service layer). The October 2026 system
audit found it no longer matched the code (`docs/SYSTEM-AUDIT-2026-10-13.md`,
section 0.2).

The diagram is now generated from the code itself and kept in
[`docs/ARCHITECTURE.md`](../../../../../docs/ARCHITECTURE.md): every route
registration, every import of `backend/src/services/`, and the packages that
reach outside systems. CI regenerates it on every push and fails when the
checked-in copy no longer matches (`npm run docs:architecture -- --check`
in `backend`), so it cannot drift again.
