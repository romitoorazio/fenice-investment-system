export type BrokerId = "directa";

export type BrokerDefinition = {
  id: BrokerId;
  displayName: string;
  aliases: readonly string[];
};

export type BrokerRecognition = {
  recognized: boolean;
  input: string;
  normalized: string;
  broker: BrokerDefinition | null;
};

const DIRECTA: BrokerDefinition = {
  id: "directa",
  displayName: "Directa SIM S.p.A.",
  aliases: [
    "directa",
    "directa sim",
    "directa sim spa",
    "directa sim s p a",
    "directa broker",
    "broker directa",
    "directa api",
    "directa darwin",
    "directa darwin 2",
    "directa darwin2",
  ],
};

export const brokerRegistry: readonly BrokerDefinition[] = [DIRECTA];

export function normalizeBrokerName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function recognizeBroker(value: unknown): BrokerRecognition {
  const input = String(value ?? "");
  const normalized = normalizeBrokerName(input);

  const broker = brokerRegistry.find((candidate) =>
    candidate.aliases.some((alias) => normalizeBrokerName(alias) === normalized),
  ) ?? null;

  return {
    recognized: broker !== null,
    input,
    normalized,
    broker,
  };
}

export function isDirectaBroker(value: unknown): boolean {
  return recognizeBroker(value).broker?.id === "directa";
}
