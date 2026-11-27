# ONE GLOBAL prospective PAPER — encrypted separate-bucket backup

The prospective store exposes `backupCurrent()` and `verifyIndependentBackup(digest)`. Neither initializes or modifies the primary, credits history, nor enables PAPER/LIVE. The owner-only action is available through the genesis route and /recupero-paper. Production backup is not yet attested.

## Owner setup (no paid plan without approval)

Use the existing Cloudflare account and a second private R2 bucket named `fenice-paper-backup-<suffix>`. A separate account remains optional. The backup bucket must never be the primary bucket. Issue distinct credentials scoped only to the backup bucket; verify primary credentials cannot access it. Configure production-only secrets:

- R2_BACKUP_ENDPOINT (optional; defaults to the primary endpoint)
- R2_BACKUP_BUCKET_NAME
- R2_BACKUP_ACCESS_KEY_ID
- R2_BACKUP_SECRET_ACCESS_KEY
- R2_BACKUP_ENCRYPTION_KEY_HEX (32 random bytes as 64 lowercase hex; generate locally, retain offline, never post in issues or logs).

Do not make the bucket public. Use provider-side retention/lock where available and authorized. Monitor bucket bytes, Class A/B operations and growth against current free quotas before enabling recurring copies. No automatic deletion or overwrite is implemented.

Each backup uses AES-256-GCM with fresh IV and digest-bound authentication, create-only digest path, SHA-256 readback and isolated replay. Stale primary state requires authenticated reload. An uncertain write must be reconciled by readback; never overwrite.

`backupAccountSeparated` distinguishes different configured Cloudflare account IDs from same-account bucket separation; it does not prove credential scope or provider-level disaster recovery. Same-account backup does not protect against loss of the entire account. Even separate accounts share Cloudflare outage risk. A future encrypted off-provider copy (e.g. Google Drive) is desirable but not a prerequisite for developing or testing PAPER. No off-provider copy is implemented or attested.

After protected release and private configuration, run the owner backup action. Keep historical journal separate. Restore into isolation first, never automatically overwrite production. Schedule verified backup alongside the authorized prospective cycle in a separate integration change. No private bytes, digests or credentials in public logs.
