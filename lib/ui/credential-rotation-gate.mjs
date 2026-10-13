/**
 * FENICE100K historical credential-exposure gate, read-only and fail-closed.
 *
 * GitHub issue #26 reports historical provider keys in tracked snapshots.
 * Sanitizing today's files, a GREEN source-health result, configured Vercel
 * secrets or a passing current-tree secret scan DO NOT prove the previously
 * exposed keys have been revoked at their providers.
 *
 * The linked provider accounts must independently confirm revocation and
 * successful replacement before a future, separately reviewed implementation
 * can mark this gate verified. Never read/decrypt/echo credentials here.
 *
 * This function deliberately does not trust runtime flags, a query string,
 * an environment variable or a self-declared GitHub JSON attestation.
 */
export function assessHistoricalCredentialRotation() {
  return {
    state: "HISTORICAL_ROTATION_UNVERIFIED",
    issueNumber: 26,
    credentialsRevokedAtProvidersVerified: false,
    replacementKeysVerified: false,
    historicalExposureResolved: false,
    currentTreeSecretScanIsInsufficient: true,
    requiresHumanProviderAccountVerification: true,
    nextAction: "Revocare/rigenerare presso i provider le credenziali storicamente esposte, sostituirle nei segreti GitHub e Vercel e verificarne revoca ed esito senza pubblicare i valori.",
    diagnosticOnly: true,
    grantsPaperCertification: false,
    brokerWritesAllowed: false,
    liveTradingAllowed: false,
  };
}
