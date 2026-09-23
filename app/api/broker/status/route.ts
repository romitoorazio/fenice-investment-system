import { getDirectaBridgeStatus, type DirectaRequestedMode } from "@/lib/brokers/directa";
import { recognizeBroker } from "@/lib/brokers/registry";

export const dynamic = "force-dynamic";

function readBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function readDirectaMode(value: string | undefined): DirectaRequestedMode {
  const normalized = String(value ?? "paper").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "paper" || normalized === "read-only" || normalized === "live") {
    return normalized;
  }
  return "paper";
}

export async function GET() {
  const configuredBroker = process.env.FENICE_BROKER ?? "directa";
  const recognition = recognizeBroker(configuredBroker);

  if (!recognition.recognized || !recognition.broker) {
    return Response.json({
      recognized: false,
      configuredBroker,
      normalizedBroker: recognition.normalized,
      executionEnabled: false,
      reason: "Configured broker is not recognized by Fenice.",
    });
  }

  if (recognition.broker.id === "directa") {
    const bridge = getDirectaBridgeStatus({
      requestedMode: readDirectaMode(process.env.FENICE_DIRECTA_MODE),
      apiAccessApproved: readBoolean(process.env.DIRECTA_API_ACCESS_APPROVED),
      technicalContractVerified: readBoolean(process.env.DIRECTA_API_CONTRACT_VERIFIED),
    });

    return Response.json({
      recognized: true,
      broker: recognition.broker,
      normalizedBroker: recognition.normalized,
      bridge,
      executionEnabled: false,
      safety: {
        failClosed: true,
        realOrdersBlocked: true,
        credentialsExposed: false,
      },
    });
  }

  return Response.json({
    recognized: false,
    configuredBroker,
    executionEnabled: false,
    reason: "No safe adapter is available for the configured broker.",
  });
}
