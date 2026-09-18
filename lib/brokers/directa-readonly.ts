import net from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  DIRECTA_DEFAULT_HOST,
  DIRECTA_DEFAULT_TRADING_PORT,
  assertLoopbackHost,
  normalizeReadOnlyCommand,
  parseDirectaLine,
  parsePortSettings,
  readOnlySnapshotCommands,
  selectTradingPort,
  type DirectaMessage,
  type DirectaOrderState,
} from "./directa-protocol.ts";

export type DirectaReadOnlyConfig = {
  host?: string;
  tradingPort?: number;
  accountCode?: string;
  connectTimeoutMs?: number;
  snapshotTimeoutMs?: number;
};

export type DirectaPositionSnapshot = {
  ticker: string;
  portfolioQuantity: number | null;
  directaQuantity: number | null;
  negotiationQuantityRaw: string;
  averagePrice: number | null;
  theoreticalGain: number | null;
  observedAt: string;
};

export type DirectaOrderSnapshot = {
  ticker: string;
  clientOrderId: string;
  operation: string;
  quantity: number | null;
  limitPrice: number | null;
  signalPrice: number | null;
  stateCode: number | null;
  state: DirectaOrderState;
  averagePrice: number | null;
  executedPrice: number | null;
  marketQuantity: number | null;
  brokerReference: string | null;
  observedAt: string;
};

export type DirectaReadOnlySnapshot = {
  generatedAt: string;
  source: "directa-dapi-local";
  mode: "read-only";
  host: "loopback";
  tradingPort: number;
  liveTradingAllowed: false;
  writeCommandsBlocked: true;
  connection: {
    state: string;
    datafeedEnabled: boolean | null;
    release: string | null;
    healthy: boolean;
  };
  account: {
    identifierPersisted: false;
    identifierPresent: boolean;
    liquidity: number | null;
    gainEuro: number | null;
    openProfitLoss: number | null;
    equity: number | null;
  } | null;
  availability: {
    equities: number | null;
    equitiesMargin: number | null;
    derivatives: number | null;
    derivativesMargin: number | null;
    totalLiquidity: number | null;
  } | null;
  positions: DirectaPositionSnapshot[];
  orders: DirectaOrderSnapshot[];
  errors: Array<{ ticker: string; code: number | null }>;
  diagnostics: {
    heartbeatCount: number;
    unknownMessageTypes: string[];
    receivedMessages: number;
    stockListComplete: boolean;
    orderListComplete: boolean;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function resolvePortSettingsPath(): string {
  return path.join(homedir(), ".directa", "engine", "APIPortSettings.txt");
}

export async function resolveLocalDirectaTradingPort(config: DirectaReadOnlyConfig = {}): Promise<number> {
  if (config.tradingPort !== undefined) {
    const port = Number(config.tradingPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("DIRECTA_INVALID_TRADING_PORT");
    return port;
  }

  try {
    const content = await readFile(resolvePortSettingsPath(), "utf8");
    return selectTradingPort(parsePortSettings(content), config.accountCode);
  } catch (error) {
    if (config.accountCode) throw error;
    return DIRECTA_DEFAULT_TRADING_PORT;
  }
}

export function reduceDirectaMessages(messages: DirectaMessage[], tradingPort = DIRECTA_DEFAULT_TRADING_PORT): DirectaReadOnlySnapshot {
  let connectionState = "UNKNOWN";
  let datafeedEnabled: boolean | null = null;
  let release: string | null = null;
  let account: DirectaReadOnlySnapshot["account"] = null;
  let availability: DirectaReadOnlySnapshot["availability"] = null;
  const positions = new Map<string, DirectaPositionSnapshot>();
  const orders = new Map<string, DirectaOrderSnapshot>();
  const errors: Array<{ ticker: string; code: number | null }> = [];
  const unknownTypes = new Set<string>();
  let heartbeatCount = 0;
  let stockListComplete = false;
  let orderListComplete = false;

  for (const message of messages) {
    if (message.kind === "heartbeat") {
      heartbeatCount += 1;
      continue;
    }

    if (message.kind === "marker") {
      if (message.value === "END STOCKLIST") stockListComplete = true;
      if (message.value === "END ORDERLIST") orderListComplete = true;
      continue;
    }

    if (message.kind === "status") {
      connectionState = message.connectionState;
      datafeedEnabled = message.datafeedEnabled;
      release = message.release || null;
      continue;
    }

    if (message.kind === "account") {
      account = {
        identifierPersisted: false,
        identifierPresent: message.accountIdentifierPresent,
        liquidity: message.liquidity,
        gainEuro: message.gainEuro,
        openProfitLoss: message.openProfitLoss,
        equity: message.equity,
      };
      continue;
    }

    if (message.kind === "availability") {
      availability = {
        equities: message.equities,
        equitiesMargin: message.equitiesMargin,
        derivatives: message.derivatives,
        derivativesMargin: message.derivativesMargin,
        totalLiquidity: message.totalLiquidity,
      };
      continue;
    }

    if (message.kind === "stock") {
      positions.set(message.ticker, {
        ticker: message.ticker,
        portfolioQuantity: message.portfolioQuantity,
        directaQuantity: message.directaQuantity,
        negotiationQuantityRaw: message.negotiationQuantityRaw,
        averagePrice: message.averagePrice,
        theoreticalGain: message.theoreticalGain,
        observedAt: message.time,
      });
      continue;
    }

    if (message.kind === "order") {
      const key = message.brokerReference || `${message.clientOrderId}:${message.time}:${message.limitPrice ?? ""}`;
      orders.set(key, {
        ticker: message.ticker,
        clientOrderId: message.clientOrderId,
        operation: message.operation,
        quantity: message.quantity,
        limitPrice: message.limitPrice,
        signalPrice: message.signalPrice,
        stateCode: message.stateCode,
        state: message.state,
        averagePrice: message.averagePrice,
        executedPrice: message.executedPrice,
        marketQuantity: message.marketQuantity,
        brokerReference: message.brokerReference,
        observedAt: message.time,
      });
      continue;
    }

    if (message.kind === "error") {
      errors.push({ ticker: message.ticker, code: message.code });
      continue;
    }

    if (message.kind === "unknown") unknownTypes.add(message.type);
  }

  const fatalConnectionErrors = new Set([1024, 1031]);
  const healthy = connectionState === "CONN_OK" && !errors.some((item) => item.code !== null && fatalConnectionErrors.has(item.code));

  return {
    generatedAt: nowIso(),
    source: "directa-dapi-local",
    mode: "read-only",
    host: "loopback",
    tradingPort,
    liveTradingAllowed: false,
    writeCommandsBlocked: true,
    connection: {
      state: connectionState,
      datafeedEnabled,
      release,
      healthy,
    },
    account,
    availability,
    positions: [...positions.values()],
    orders: [...orders.values()],
    errors,
    diagnostics: {
      heartbeatCount,
      unknownMessageTypes: [...unknownTypes],
      receivedMessages: messages.length,
      stockListComplete,
      orderListComplete,
    },
  };
}

export async function collectDirectaReadOnlySnapshot(config: DirectaReadOnlyConfig = {}): Promise<DirectaReadOnlySnapshot> {
  const host = config.host ?? DIRECTA_DEFAULT_HOST;
  assertLoopbackHost(host);
  const tradingPort = await resolveLocalDirectaTradingPort(config);
  const connectTimeoutMs = Math.max(250, Number(config.connectTimeoutMs ?? 2500));
  const snapshotTimeoutMs = Math.max(500, Number(config.snapshotTimeoutMs ?? 4000));

  return await new Promise<DirectaReadOnlySnapshot>((resolve, reject) => {
    const messages: DirectaMessage[] = [];
    let buffer = "";
    let settled = false;
    let stockListComplete = false;
    let orderListComplete = false;
    let hasStatus = false;
    let hasAccount = false;
    let hasAvailability = false;

    const socket = net.createConnection({ host, port: tradingPort });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(snapshotTimer);
      socket.end();
      resolve(reduceDirectaMessages(messages, tradingPort));
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(snapshotTimer);
      socket.destroy();
      reject(error);
    };

    const maybeFinish = () => {
      if (stockListComplete && orderListComplete && hasStatus && hasAccount && hasAvailability) {
        setTimeout(finish, 50);
      }
    };

    const consumeLine = (line: string) => {
      const parsed = parseDirectaLine(line);
      if (!parsed) return;
      messages.push(parsed);
      if (parsed.kind === "marker" && parsed.value === "END STOCKLIST") stockListComplete = true;
      if (parsed.kind === "marker" && parsed.value === "END ORDERLIST") orderListComplete = true;
      if (parsed.kind === "status") hasStatus = true;
      if (parsed.kind === "account") hasAccount = true;
      if (parsed.kind === "availability") hasAvailability = true;
      maybeFinish();
    };

    const connectTimer = setTimeout(() => fail(new Error("DIRECTA_CONNECT_TIMEOUT")), connectTimeoutMs);
    const snapshotTimer = setTimeout(finish, snapshotTimeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      clearTimeout(connectTimer);
      try {
        for (const command of readOnlySnapshotCommands()) {
          socket.write(normalizeReadOnlyCommand(command));
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    });

    socket.on("error", (error) => fail(new Error(`DIRECTA_SOCKET_ERROR: ${error.message}`)));
    socket.on("close", () => {
      if (buffer.trim()) consumeLine(buffer);
      if (!settled) finish();
    });
  });
}
