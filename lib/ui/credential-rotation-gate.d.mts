/**
 * Type declaration for the adjacent runtime .mjs module.
 * The contract intentionally has no input capable of authorizing a rotation.
 */
export type HistoricalCredentialRotationAssessment = Readonly<{
  state: "HISTORICAL_ROTATION_UNVERIFIED";
  issueNumber: 26;
  credentialsRevokedAtProvidersVerified: false;
  replacementKeysVerified: false;
  historicalExposureResolved: false;
  currentTreeSecretScanIsInsufficient: true;
  requiresHumanProviderAccountVerification: true;
  nextAction: string;
  diagnosticOnly: true;
  grantsPaperCertification: false;
  brokerWritesAllowed: false;
  liveTradingAllowed: false;
}>;

export declare function assessHistoricalCredentialRotation(): HistoricalCredentialRotationAssessment;
