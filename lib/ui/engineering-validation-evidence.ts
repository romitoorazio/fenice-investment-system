export type EngineeringValidationRecord = {
  version?: number;
  generatedAt?: string | null;
  state?: string;
  source?: {
    workflow?: string;
    workflowRunId?: number | string | null;
    workflowUrl?: string | null;
    validatedCommit?: string | null;
    branch?: string | null;
    event?: string | null;
    conclusion?: string | null;
  };
  contractDigest?: string | null;
  policy?: {
    failClosed?: boolean;
    liveTradingAllowed?: boolean;
    brokerConnectivityAllowed?: boolean;
    ciEvidenceCannotAuthorizeLive?: boolean;
  };
  controls?: Record<string, {
    verified?: boolean;
    evidenceClass?: string;
    requiredSteps?: string[];
  }>;
};

export const ENGINEERING_CI_CONTRACT = {
  "crash-recovery": [
    ["Institutional risk reconciliation shadow and recovery controls", "npm run institutional:test"],
    ["Atomic state persistence and corruption handling", "npm run state:test"],
    ["Adverse-condition chaos resilience", "npm run chaos:test"],
  ],
  "chaos-tests": [
    ["Adverse-condition chaos resilience", "npm run chaos:test"],
  ],
  "persistent-audit": [
    ["Institutional paper OMS safety", "npm run trading:ops"],
    ["Atomic state persistence and corruption handling", "npm run state:test"],
  ],
} as const;

export function validateEngineeringCiContract(ciText: string) {
  const missing: string[] = [];
  for (const [control, requirements] of Object.entries(ENGINEERING_CI_CONTRACT)) {
    for (const [step, command] of requirements) {
      if (!ciText.includes(`name: ${step}`) || !ciText.includes(`run: ${command}`)) {
        missing.push(`${control}: ${step} -> ${command}`);
      }
    }
  }
  return { valid: missing.length === 0, missing };
}

export function buildEngineeringValidationRecord(input: {
  generatedAt: string;
  workflowRunId: number;
  workflowUrl: string;
  validatedCommit: string;
  branch: string;
  event: string;
  conclusion: string;
  contractDigest: string;
}) {
  const generatedAt = Date.parse(input.generatedAt);
  const runId = Number(input.workflowRunId);
  const valid = Number.isFinite(generatedAt)
    && Number.isInteger(runId)
    && runId > 0
    && /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/.test(input.workflowUrl)
    && /^[0-9a-f]{40}$/i.test(input.validatedCommit)
    && input.branch === "main"
    && input.event === "push"
    && input.conclusion === "success"
    && /^[0-9a-f]{64}$/i.test(input.contractDigest);

  if (!valid) throw new Error("INVALID_ENGINEERING_VALIDATION_SOURCE");

  const controls = Object.fromEntries(Object.entries(ENGINEERING_CI_CONTRACT).map(([id, requirements]) => [
    id,
    {
      verified: true,
      evidenceClass: "SUCCESSFUL_MAIN_CI_CONTRACT",
      requiredSteps: requirements.map(([step]) => step),
    },
  ]));

  return {
    version: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    state: "VERIFIED",
    source: {
      workflow: "Fenice Production CI",
      workflowRunId: runId,
      workflowUrl: input.workflowUrl,
      validatedCommit: input.validatedCommit.toLowerCase(),
      branch: "main",
      event: "push",
      conclusion: "success",
    },
    contractDigest: input.contractDigest.toLowerCase(),
    policy: {
      failClosed: true,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      ciEvidenceCannotAuthorizeLive: true,
    },
    controls,
  };
}

export function deriveEngineeringValidationEvidence(record: EngineeringValidationRecord | null | undefined) {
  const generatedAt = Date.parse(String(record?.generatedAt || ""));
  const runId = Number(record?.source?.workflowRunId);
  const sourceValid = Number(record?.version || 0) >= 1
    && record?.state === "VERIFIED"
    && Number.isFinite(generatedAt)
    && record?.source?.workflow === "Fenice Production CI"
    && Number.isInteger(runId)
    && runId > 0
    && /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/.test(String(record?.source?.workflowUrl || ""))
    && /^[0-9a-f]{40}$/i.test(String(record?.source?.validatedCommit || ""))
    && record?.source?.branch === "main"
    && record?.source?.event === "push"
    && record?.source?.conclusion === "success"
    && /^[0-9a-f]{64}$/i.test(String(record?.contractDigest || ""));

  const policyValid = record?.policy?.failClosed === true
    && record?.policy?.liveTradingAllowed === false
    && record?.policy?.brokerConnectivityAllowed === false
    && record?.policy?.ciEvidenceCannotAuthorizeLive === true;
  const valid = sourceValid && policyValid;
  const controlVerified = (id: string) => valid
    && record?.controls?.[id]?.verified === true
    && record?.controls?.[id]?.evidenceClass === "SUCCESSFUL_MAIN_CI_CONTRACT";

  return {
    valid,
    generatedAt: valid ? new Date(generatedAt).toISOString() : null,
    workflowRunId: valid ? runId : null,
    workflowUrl: valid ? String(record?.source?.workflowUrl || "") : null,
    validatedCommit: valid ? String(record?.source?.validatedCommit || "") : null,
    crashRecoveryVerified: controlVerified("crash-recovery"),
    chaosTestsVerified: controlVerified("chaos-tests"),
    persistentAuditImplementationVerified: controlVerified("persistent-audit"),
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    failClosed: true,
  };
}
