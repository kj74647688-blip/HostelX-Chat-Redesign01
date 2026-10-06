---
name: HostelX sign-in identifiers
description: User-approved sign-in behavior for permanent accounts and display IDs.
---

After profile setup, residents may sign in with either their permanent `userN.hostelx.in` ID or their generated name-based display ID. Both identify the same immutable internal account and use the current password.

**Why:** the user confirmed that both IDs should work after residents reported being unable to sign in with their newly assigned display IDs.

**How to apply:** keep both identifiers case-normalized, prevent generated display IDs from colliding with permanent login IDs, and use the permanent account as the canonical identity for rate limits and sessions.
