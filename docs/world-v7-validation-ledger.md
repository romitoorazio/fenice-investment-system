# FENICE V7 world validation — read only

Eight markets are tracked: USA XNAS, XNYS and ARCX; Europe XMIL and XETR; Asia XTKS; Latin America BVMF; Oceania XASX.

Three separate evidence classes are preserved:
- US dual-source quote concordance from Alpaca IEX and Twelve Data (source continuity).
- Global EOD completed-bar research (Xetra, Milan, Tokyo) from Alpha Vantage.
- Twelve Data's single-provider access and catalogue status (not a licence).

The system watches existing source reports generated within the previous 4 hours. No old snapshots are counted retroactively; duplicate events are ignored. No additional API requests are made. A repeated Xetra EOD bar counts as one research day, not multiple days.

Latin America and Oceania are explicitly marked as not yet served, not silently assumed to be certified. No market is eligible for PAPER by this evidence journal; actual authorized source contracts, exact venue identities, current authoritative venue sessions, independent realtime feeds, applicable FX and forward strategy evidence are separate gates.

No quotes, credential material, Directa state or positions are written to the ledger. No V6 core files are touched. The global observer produces only a GitHub metadata report.

Command: node scripts/test-world-v7-validation-ledger.mjs
