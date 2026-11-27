# ONE GLOBAL prospective PAPER — independent encrypted backup

The prospective store now exposes `backupCurrent()` and `verifyIndependentBackup(digest)`. Neither initializes the journal, credits history, modifies the primary, or enables PAPER/LIVE. This is a storage primitive, not yet an activated scheduler or production attestation.

## Owner setup (no paid plan without approval)

Use a separate private R2 account and bucket named `fenice-paper-backup-<suffix>`, with a scoped object read/write credential distinct from primary. Configure production-only secrets:
- R2_BACKUP_ENDPOINT
- R2_BACKUP_BUCKET_NAME
- R2_BACKUP_ACCESS_KEY_ID
- R2_BACKUP_SECRET_ACCESS_KEY
- R2_BACKUP_ENCRYPTION_KEY_HEX (32 random bytes encoded as 64 lowercase hex characters; generate locally, never paste into issue/PR, keep an offline recovery copy).

Do not make the bucket public. Configure provider-side retention/lock if available and authorized; monitor quota and version growth. No automatic deletion or overwrite is implemented. A second account reduces account/bucket failure coupling, but not Cloudflare-wide outage risk. Confirm free-plan capacity before enabling recurring copies.

Each backup contains the exact validated primary envelope, AES-256-GCM with fresh IV and digest-bound authentication, immutable create-only object path, and SHA-256 readback. Recovery decrypts and replays without rewriting either store. The current-state check rejects a concurrent newer primary; retry only after authenticated reload. An uncertain write must be reconciled by readback; never overwrite.

Next: owner-authenticated production backup action and readback, schedule alongside the authorized prospective cycle, verify retention/quota monitoring, and attest independent recovery only after real provider evidence. No private bytes, digest, or credentials in public logs. Restore into an isolated environment first; no automatic production overwrite. Preserve historical journal separately.
