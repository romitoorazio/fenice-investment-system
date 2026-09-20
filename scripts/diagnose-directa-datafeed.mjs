import net from "node:net";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { resolveLocalDirectaDatafeedPort } from "../lib/brokers/directa-datafeed.ts";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tickerArg = readArg("--tickers") || "STLAM,UCG";
const tickers = tickerArg.split(",").map((v) => v.trim().toUpperCase()).filter((v) => /^[A-Z0-9._-]{1,40}$/.test(v));
const explicitPort = readArg("--port");
const accountCode = readArg("--account") || process.env.DIRECTA_ACCOUNT_CODE || undefined;
const port = await resolveLocalDirectaDatafeedPort({ datafeedPort: explicitPort ? Number(explicitPort) : undefined, accountCode });
const host = "127.0.0.1";
const timeoutMs = 8000;

const counts = new Map();
let heartbeat = 0;
let bytes = 0;
let lines = 0;
let errors = [];
let buffer = "";
let connected = false;
let subscriptionSent = false;

function count(type) { counts.set(type, (counts.get(type) || 0) + 1); }
function consume(line) {
  const clean = line.trim();
  if (!clean) return;
  lines += 1;
  if (clean === "H") { heartbeat += 1; count("HEARTBEAT"); return; }
  const fields = clean.split(";");
  const type = String(fields[0] || "UNKNOWN").trim().toUpperCase().slice(0, 32) || "UNKNOWN";
  count(type);
  if (type === "ERR") errors.push({ ticker: String(fields[1] || "").slice(0, 40), code: Number.isFinite(Number(fields[2])) ? Number(fields[2]) : null });
}

const socket = net.createConnection({ host, port });
socket.setEncoding("utf8");
const result = await new Promise((resolve) => {
  let finished = false;
  const finish = (reason) => {
    if (finished) return;
    finished = true;
    try { if (connected) socket.write(`UNS ${tickers.join(",")}\n`); } catch {}
    socket.end();
    resolve(reason);
  };
  socket.on("connect", () => {
    connected = true;
    socket.write(`SUBPRZALL ${tickers.join(",")}\n`);
    subscriptionSent = true;
  });
  socket.on("data", (chunk) => {
    bytes += Buffer.byteLength(chunk, "utf8");
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || "";
    for (const line of parts) consume(line);
  });
  socket.on("error", (error) => { errors.push({ ticker: "", code: null, socket: String(error.code || "SOCKET_ERROR") }); finish("socket-error"); });
  socket.on("close", () => { if (buffer.trim()) consume(buffer); finish("socket-closed"); });
  setTimeout(() => finish("diagnostic-timeout"), timeoutMs);
});

const typeCounts = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
const priced = (typeCounts.PRICE || 0) + (typeCounts.PRICE_AUCT || 0);
const bidAsk = typeCounts.BIDASK || 0;
let diagnosis = "DATA_RECEIVED";
if (!connected) diagnosis = "LOCAL_DATAFEED_SOCKET_NOT_CONNECTED";
else if (lines === 0) diagnosis = "CONNECTED_BUT_NO_MESSAGES: verify Darwin DAPI/datafeed service and entitlement";
else if (heartbeat > 0 && priced === 0 && bidAsk === 0) diagnosis = "HEARTBEAT_ONLY: socket is alive but quote stream is unavailable/not entitled or subscription is not producing data";
else if (errors.length > 0 && priced === 0 && bidAsk === 0) diagnosis = "DIRECTA_RETURNED_ERRORS: inspect sanitized error codes";
else if (priced === 0 && bidAsk === 0) diagnosis = "MESSAGES_WITHOUT_QUOTES: inspect message type counts; possible protocol/subscription mismatch";

console.log("=== Fenice Directa READ-ONLY sanitized diagnostic ===");
console.log(`Host: loopback`);
console.log(`Datafeed port: ${port}`);
console.log(`Connected: ${connected}`);
console.log(`Subscription sent: ${subscriptionSent}`);
console.log(`Requested tickers: ${tickers.join(", ")}`);
console.log(`Observation window ms: ${timeoutMs}`);
console.log(`Bytes received: ${bytes}`);
console.log(`Messages received: ${lines}`);
console.log(`Heartbeats: ${heartbeat}`);
console.log(`Message types: ${JSON.stringify(typeCounts)}`);
console.log(`PRICE messages: ${priced}`);
console.log(`BIDASK messages: ${bidAsk}`);
console.log(`Sanitized errors: ${JSON.stringify(errors)}`);
console.log(`Diagnosis: ${diagnosis}`);
console.log("Trading write commands allowed: false");
console.log(`Completion: ${result}`);
console.log("No credentials, account identifiers, quote payloads or secret values are printed by this diagnostic.");

if (!connected || priced === 0 || bidAsk === 0) process.exitCode = 2;
