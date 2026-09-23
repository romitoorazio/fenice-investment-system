import net from "node:net";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { assertLoopbackHost, parsePortSettings } from "./directa-protocol.ts";

export const DIRECTA_DEFAULT_DATAFEED_PORT = 10001 as const;

export type DirectaDatafeedConfig = {
  host?: string;
  datafeedPort?: number;
  accountCode?: string;
  connectTimeoutMs?: number;
  snapshotTimeoutMs?: number;
};

export type DirectaQuote = {
  ticker: string;
  observedAt: string;
  priceObservedAt: string;
  bookObservedAt: string;
  metadataObservedAt: string;
  lastPrice: number | null;
  lastQuantity: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  bidPrice: number | null;
  bidQuantity: number | null;
  askPrice: number | null;
  askQuantity: number | null;
  referencePrice: number | null;
  openPrice: number | null;
  isin: string | null;
  description: string | null;
};

export type DirectaDatafeedSnapshot = {
  generatedAt: string;
  source: "directa-dapi-datafeed-local";
  mode: "read-only-market-data";
  host: "loopback";
  datafeedPort: number;
  subscriptionCommand: "SUBPRZALL";
  writeTradingCommandsAllowed: false;
  quotes: DirectaQuote[];
  errors: Array<{ ticker: string; code: number | null }>;
  diagnostics: {
    heartbeatCount: number;
    receivedMessages: number;
    requestedTickers: string[];
    pricedTickers: string[];
    bidAskTickers: string[];
  };
};

type DatafeedMessage =
  | { kind: "heartbeat" }
  | { kind: "anag"; ticker: string; time: string; isin: string; description: string; referencePrice: number | null; openPrice: number | null }
  | { kind: "price"; ticker: string; time: string; price: number | null; quantity: number | null; dayLow: number | null; dayHigh: number | null }
  | { kind: "bidask"; ticker: string; time: string; bidQuantity: number | null; bidPrice: number | null; askQuantity: number | null; askPrice: number | null }
  | { kind: "error"; ticker: string; code: number | null }
  | { kind: "other"; type: string };

function finite(value: string | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTicker(value: string): string {
  const ticker = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,40}$/.test(ticker)) throw new Error(`DIRECTA_INVALID_TICKER: ${value}`);
  return ticker;
}

export function normalizeDatafeedTickers(values: string[]): string[] {
  const unique = [...new Set(values.map(normalizeTicker))];
  if (!unique.length) throw new Error("DIRECTA_DATAFEED_EMPTY_SUBSCRIPTION");
  if (unique.length > 90) throw new Error("DIRECTA_DATAFEED_MAX_90_TICKERS_PER_COMMAND");
  return unique;
}

export function parseDirectaDatafeedLine(input: string): DatafeedMessage | null {
  const line = input.replace(/[\r\n]+$/g, "").trim();
  if (!line) return null;
  if (line === "H") return { kind: "heartbeat" };
  const fields = line.split(";").map((field) => field.trim());
  const type = fields[0] ?? "";

  if (type === "ANAG") {
    return {
      kind: "anag",
      ticker: normalizeTicker(fields[1] ?? ""),
      time: fields[2] ?? "",
      isin: fields[3] ?? "",
      description: fields[4] ?? "",
      referencePrice: finite(fields[5]),
      openPrice: finite(fields[6]),
    };
  }
  if (type === "PRICE" || type === "PRICE_AUCT") {
    return {
      kind: "price",
      ticker: normalizeTicker(fields[1] ?? ""),
      time: fields[2] ?? "",
      price: finite(fields[3]),
      quantity: type === "PRICE" ? finite(fields[4]) : null,
      dayLow: type === "PRICE" ? finite(fields[7]) : null,
      dayHigh: type === "PRICE" ? finite(fields[8]) : null,
    };
  }
  if (type === "BIDASK") {
    return {
      kind: "bidask",
      ticker: normalizeTicker(fields[1] ?? ""),
      time: fields[2] ?? "",
      bidQuantity: finite(fields[3]),
      bidPrice: finite(fields[5]),
      askQuantity: finite(fields[6]),
      askPrice: finite(fields[8]),
    };
  }
  if (type === "ERR") {
    return { kind: "error", ticker: fields[1] ?? "", code: finite(fields[2]) };
  }
  return { kind: "other", type };
}

function portSettingsPath(): string {
  return path.join(homedir(), ".directa", "engine", "APIPortSettings.txt");
}

export async function resolveLocalDirectaDatafeedPort(config: DirectaDatafeedConfig = {}): Promise<number> {
  if (config.datafeedPort !== undefined) {
    const port = Number(config.datafeedPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("DIRECTA_INVALID_DATAFEED_PORT");
    return port;
  }
  let content: string;
  try {
    content = await readFile(portSettingsPath(), "utf8");
  } catch (error) {
    if (config.accountCode) throw error;
    return DIRECTA_DEFAULT_DATAFEED_PORT;
  }
  const settings = parsePortSettings(content);
  if (!settings.length) return DIRECTA_DEFAULT_DATAFEED_PORT;
  if (config.accountCode) {
    const match = settings.find((item) => item.accountCode === config.accountCode);
    if (!match) throw new Error("DIRECTA_ACCOUNT_PORT_NOT_FOUND");
    return match.datafeedPort;
  }
  if (settings.length > 1) throw new Error("DIRECTA_MULTIPLE_ACCOUNTS: specify account code for datafeed socket.");
  return settings[0].datafeedPort;
}

export async function collectDirectaQuoteSnapshot(
  tickersInput: string[],
  config: DirectaDatafeedConfig = {},
): Promise<DirectaDatafeedSnapshot> {
  const tickers = normalizeDatafeedTickers(tickersInput);
  const host = config.host ?? "127.0.0.1";
  assertLoopbackHost(host);
  const datafeedPort = await resolveLocalDirectaDatafeedPort(config);
  const connectTimeoutMs = Math.max(250, Number(config.connectTimeoutMs ?? 2500));
  const snapshotTimeoutMs = Math.max(750, Number(config.snapshotTimeoutMs ?? 3500));

  return await new Promise<DirectaDatafeedSnapshot>((resolve, reject) => {
    const quotes = new Map<string, DirectaQuote>();
    const errors: Array<{ ticker: string; code: number | null }> = [];
    let buffer = "";
    let heartbeatCount = 0;
    let receivedMessages = 0;
    let settled = false;
    const pricedTickers = new Set<string>();
    const bidAskTickers = new Set<string>();
    const socket = net.createConnection({ host, port: datafeedPort });

    const quoteFor = (ticker: string): DirectaQuote => {
      const existing = quotes.get(ticker);
      if (existing) return existing;
      const created: DirectaQuote = {
        ticker,
        observedAt: "",
        priceObservedAt: "",
        bookObservedAt: "",
        metadataObservedAt: "",
        lastPrice: null,
        lastQuantity: null,
        dayLow: null,
        dayHigh: null,
        bidPrice: null,
        bidQuantity: null,
        askPrice: null,
        askQuantity: null,
        referencePrice: null,
        openPrice: null,
        isin: null,
        description: null,
      };
      quotes.set(ticker, created);
      return created;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(snapshotTimer);
      try { socket.write(`UNS ${tickers.join(",")}\n`); } catch { /* read-only unsubscribe best effort */ }
      socket.end();
      resolve({
        generatedAt: new Date().toISOString(),
        source: "directa-dapi-datafeed-local",
        mode: "read-only-market-data",
        host: "loopback",
        datafeedPort,
        subscriptionCommand: "SUBPRZALL",
        writeTradingCommandsAllowed: false,
        quotes: [...quotes.values()],
        errors,
        diagnostics: {
          heartbeatCount,
          receivedMessages,
          requestedTickers: tickers,
          pricedTickers: [...pricedTickers],
          bidAskTickers: [...bidAskTickers],
        },
      });
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(snapshotTimer);
      socket.destroy();
      reject(error);
    };

    const consume = (line: string) => {
      let message: DatafeedMessage | null;
      try {
        message = parseDirectaDatafeedLine(line);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      if (!message) return;
      receivedMessages += 1;
      if (message.kind === "heartbeat") { heartbeatCount += 1; return; }
      if (message.kind === "error") { errors.push({ ticker: message.ticker, code: message.code }); return; }
      if (message.kind === "other") return;
      const quote = quoteFor(message.ticker);
      if (message.time) quote.observedAt = message.time;
      if (message.kind === "anag") {
        quote.metadataObservedAt = message.time || quote.metadataObservedAt;
        quote.isin = message.isin || null;
        quote.description = message.description || null;
        quote.referencePrice = message.referencePrice;
        quote.openPrice = message.openPrice;
      } else if (message.kind === "price") {
        quote.priceObservedAt = message.time || quote.priceObservedAt;
        quote.lastPrice = message.price;
        quote.lastQuantity = message.quantity;
        quote.dayLow = message.dayLow;
        quote.dayHigh = message.dayHigh;
        pricedTickers.add(message.ticker);
      } else if (message.kind === "bidask") {
        quote.bookObservedAt = message.time || quote.bookObservedAt;
        quote.bidPrice = message.bidPrice;
        quote.bidQuantity = message.bidQuantity;
        quote.askPrice = message.askPrice;
        quote.askQuantity = message.askQuantity;
        bidAskTickers.add(message.ticker);
      }
      if (tickers.every((ticker) => pricedTickers.has(ticker) && bidAskTickers.has(ticker))) setTimeout(finish, 25);
    };

    const connectTimer = setTimeout(() => fail(new Error("DIRECTA_DATAFEED_CONNECT_TIMEOUT")), connectTimeoutMs);
    const snapshotTimer = setTimeout(finish, snapshotTimeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      clearTimeout(connectTimer);
      socket.write(`SUBPRZALL ${tickers.join(",")}\n`);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    socket.on("error", (error) => fail(new Error(`DIRECTA_DATAFEED_SOCKET_ERROR: ${error.message}`)));
    socket.on("close", () => {
      if (buffer.trim()) consume(buffer);
      if (!settled) finish();
    });
  });
}
