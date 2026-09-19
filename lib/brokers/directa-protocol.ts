export const DIRECTA_CONTRACT_VERSION = "2025-07-16" as const;
export const DIRECTA_DEFAULT_HOST = "127.0.0.1" as const;
export const DIRECTA_DEFAULT_TRADING_PORT = 10002 as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const READ_ONLY_SIMPLE_COMMANDS = new Set([
  "DARWINSTATUS",
  "INFOACCOUNT",
  "INFOAVAILABILITY",
  "INFOSTOCKS",
  "ORDERLIST",
  "ORDERLISTNOREV",
  "ORDERLISTPENDING",
  "FLOWPOINT TRUE",
  "PRICEEXE TRUE",
]);

const FORBIDDEN_WRITE_PREFIXES = [
  "ACQAZ",
  "VENAZ",
  "ACQMARK",
  "ACQMARKET",
  "VENMARK",
  "VENMARKET",
  "ACQSTOP",
  "VENSTOP",
  "ACQSTOPLIMIT",
  "VENSTOPLIMIT",
  "REVORD",
  "REVALL",
  "CONFORD",
  "KID_DOWNLOAD",
  "KID_ACCEPT",
  "MODORD",
  "CLOSEDARWIN",
] as const;

export type DirectaOrderState =
  | "IN_NEGOTIATION"
  | "SUBMISSION_ERROR"
  | "IN_NEGOTIATION_AFTER_CONFIRMATION"
  | "FILLED"
  | "CANCELLED"
  | "AWAITING_CONFIRMATION"
  | "MODIFIED"
  | "UNKNOWN";

export type DirectaMessage =
  | { kind: "heartbeat" }
  | { kind: "marker"; value: string }
  | { kind: "option"; name: string; value: string }
  | { kind: "status"; connectionState: string; datafeedEnabled: boolean | null; release: string }
  | { kind: "account"; time: string; accountIdentifierPresent: boolean; liquidity: number | null; gainEuro: number | null; openProfitLoss: number | null; equity: number | null }
  | { kind: "availability"; time: string; equities: number | null; equitiesMargin: number | null; derivatives: number | null; derivativesMargin: number | null; totalLiquidity: number | null }
  | { kind: "stock"; update: boolean; ticker: string; time: string; portfolioQuantity: number | null; directaQuantity: number | null; negotiationQuantityRaw: string; averagePrice: number | null; theoreticalGain: number | null }
  | { kind: "order"; update: boolean; ticker: string; time: string; clientOrderId: string; operation: string; limitPrice: number | null; signalPrice: number | null; quantity: number | null; stateCode: number | null; state: DirectaOrderState; averagePrice: number | null; executedPrice: number | null; marketQuantity: number | null; brokerReference: string | null }
  | { kind: "trading-result"; type: "TRADOK" | "TRADERR" | "TRADCONFIRM"; ticker: string; clientOrderId: string; code: number | null; operation: string; quantity: number | null; requestedPrice: number | null; description: string; executedPrice: number | null; executedQuantity: number | null; residualQuantity: number | null; brokerReference: string | null }
  | { kind: "error"; ticker: string; code: number | null }
  | { kind: "unknown"; type: string };

export type DirectaPortSetting = {
  accountCode: string;
  datafeedPort: number;
  tradingPort: number;
  historyPort: number;
};

function finiteNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host.trim().toLowerCase())) {
    throw new Error("DIRECTA_LOOPBACK_ONLY: Directa dAPI sockets may only be accessed through localhost/loopback.");
  }
}

export function isForbiddenDirectaWriteCommand(command: string): boolean {
  const normalized = command.trim().toUpperCase();
  return FORBIDDEN_WRITE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

export function normalizeReadOnlyCommand(command: string): string {
  const trimmed = command.replace(/[\r\n]+$/g, "").trim();
  if (!trimmed) throw new Error("DIRECTA_EMPTY_COMMAND");
  const upper = trimmed.toUpperCase();

  if (isForbiddenDirectaWriteCommand(upper)) {
    throw new Error(`DIRECTA_WRITE_COMMAND_BLOCKED: ${upper.split(/[ ,]/, 1)[0]}`);
  }

  if (READ_ONLY_SIMPLE_COMMANDS.has(upper)) return `${upper}\n`;

  const getPosition = upper.match(/^GETPOSITION\s+([A-Z0-9._-]{1,40})$/);
  if (getPosition) return `GETPOSITION ${getPosition[1]}\n`;

  throw new Error(`DIRECTA_COMMAND_NOT_WHITELISTED: ${upper.split(" ", 1)[0]}`);
}

export function readOnlySnapshotCommands(): string[] {
  return [
    "FLOWPOINT TRUE\n",
    "PRICEEXE TRUE\n",
    "DARWINSTATUS\n",
    "INFOACCOUNT\n",
    "INFOAVAILABILITY\n",
    "INFOSTOCKS\n",
    "ORDERLIST\n",
  ];
}

export function parsePortSettings(text: string): DirectaPortSetting[] {
  const settings: DirectaPortSetting[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([^;]+);(\d+);(\d+);(\d+)$/);
    if (!match) continue;
    const datafeedPort = Number(match[2]);
    const tradingPort = Number(match[3]);
    const historyPort = Number(match[4]);
    if (![datafeedPort, tradingPort, historyPort].every((port) => Number.isInteger(port) && port > 0 && port <= 65535)) continue;
    settings.push({ accountCode: match[1], datafeedPort, tradingPort, historyPort });
  }
  return settings;
}

export function selectTradingPort(settings: DirectaPortSetting[], accountCode?: string): number {
  if (!settings.length) return DIRECTA_DEFAULT_TRADING_PORT;
  if (accountCode) {
    const match = settings.find((item) => item.accountCode === accountCode);
    if (!match) throw new Error("DIRECTA_ACCOUNT_PORT_NOT_FOUND");
    return match.tradingPort;
  }
  if (settings.length > 1) {
    throw new Error("DIRECTA_MULTIPLE_ACCOUNTS: specify the local account code to select the correct trading socket.");
  }
  return settings[0].tradingPort;
}

export function mapDirectaOrderState(code: number | null): DirectaOrderState {
  switch (code) {
    case 2000: return "IN_NEGOTIATION";
    case 2001: return "SUBMISSION_ERROR";
    case 2002: return "IN_NEGOTIATION_AFTER_CONFIRMATION";
    case 2003: return "FILLED";
    case 2004: return "CANCELLED";
    case 2005: return "AWAITING_CONFIRMATION";
    case 2006: return "MODIFIED";
    default: return "UNKNOWN";
  }
}

export function parseDirectaLine(input: string): DirectaMessage | null {
  const line = input.replace(/[\r\n]+$/g, "").trim();
  if (!line) return null;
  if (line === "H") return { kind: "heartbeat" };
  if (line.startsWith("BEGIN ") || line.startsWith("END ")) return { kind: "marker", value: line };

  const fields = line.split(";").map((field) => field.trim());
  const type = fields[0] ?? "";

  if (["FLOWPOINT", "PRICEEXE", "UPDATEORDER", "POINTUPDATEORDER", "LOGCMD", "AUTOREC"].includes(type)) {
    return { kind: "option", name: type, value: fields.slice(1).join(";") };
  }

  if (type === "DARWIN_STATUS") {
    return {
      kind: "status",
      connectionState: fields[1] ?? "UNKNOWN",
      datafeedEnabled: fields[2] === "TRUE" ? true : fields[2] === "FALSE" ? false : null,
      release: fields.slice(3).join(";"),
    };
  }

  if (type === "INFOACCOUNT" || type === "UINFOACCOUNT") {
    return {
      kind: "account",
      time: fields[1] ?? "",
      accountIdentifierPresent: Boolean(fields[2]),
      liquidity: finiteNumber(fields[3]),
      gainEuro: finiteNumber(fields[4]),
      openProfitLoss: finiteNumber(fields[5]),
      equity: finiteNumber(fields[6]),
    };
  }

  if (type === "AVAILABILITY" || type === "UAVAILABILITY") {
    return {
      kind: "availability",
      time: fields[1] ?? "",
      equities: finiteNumber(fields[2]),
      equitiesMargin: finiteNumber(fields[3]),
      derivatives: finiteNumber(fields[4]),
      derivativesMargin: finiteNumber(fields[5]),
      totalLiquidity: finiteNumber(fields[6]),
    };
  }

  if (type === "STOCK" || type === "USTOCK") {
    return {
      kind: "stock",
      update: type === "USTOCK",
      ticker: fields[1] ?? "",
      time: fields[2] ?? "",
      portfolioQuantity: finiteNumber(fields[3]),
      directaQuantity: finiteNumber(fields[4]),
      negotiationQuantityRaw: fields[5] ?? "",
      averagePrice: finiteNumber(fields[6]),
      theoreticalGain: finiteNumber(fields[7]),
    };
  }

  if (type === "ORDER" || type === "UORDER") {
    const stateCode = finiteNumber(fields[8]);
    return {
      kind: "order",
      update: type === "UORDER",
      ticker: fields[1] ?? "",
      time: fields[2] ?? "",
      clientOrderId: fields[3] ?? "",
      operation: fields[4] ?? "",
      limitPrice: finiteNumber(fields[5]),
      signalPrice: finiteNumber(fields[6]),
      quantity: finiteNumber(fields[7]),
      stateCode,
      state: mapDirectaOrderState(stateCode),
      averagePrice: finiteNumber(fields[9]),
      executedPrice: finiteNumber(fields[10]),
      marketQuantity: finiteNumber(fields[11]),
      brokerReference: fields[12] || null,
    };
  }

  if (type === "TRADOK" || type === "TRADERR" || type === "TRADCONFIRM") {
    return {
      kind: "trading-result",
      type,
      ticker: fields[1] ?? "",
      clientOrderId: fields[2] ?? "",
      code: finiteNumber(fields[3]),
      operation: fields[4] ?? "",
      quantity: finiteNumber(fields[5]),
      requestedPrice: finiteNumber(fields[6]),
      description: fields[7] ?? "",
      executedPrice: finiteNumber(fields[8]),
      executedQuantity: finiteNumber(fields[9]),
      residualQuantity: finiteNumber(fields[10]),
      brokerReference: fields[11] || null,
    };
  }

  if (type === "ERR") {
    return { kind: "error", ticker: fields[1] ?? "", code: finiteNumber(fields[2]) };
  }

  return { kind: "unknown", type };
}
