import assert from "node:assert/strict";
import {
  assertLoopbackHost,
  isForbiddenDirectaWriteCommand,
  mapDirectaOrderState,
  normalizeReadOnlyCommand,
  parseDirectaLine,
  parsePortSettings,
  selectTradingPort,
} from "../lib/brokers/directa-protocol.ts";
import { reduceDirectaMessages } from "../lib/brokers/directa-readonly.ts";

assert.doesNotThrow(() => assertLoopbackHost("127.0.0.1"));
assert.doesNotThrow(() => assertLoopbackHost("localhost"));
assert.throws(() => assertLoopbackHost("192.168.1.10"), /DIRECTA_LOOPBACK_ONLY/);

assert.equal(normalizeReadOnlyCommand("INFOACCOUNT"), "INFOACCOUNT\n");
assert.equal(normalizeReadOnlyCommand("getposition stlam"), "GETPOSITION STLAM\n");
assert.equal(normalizeReadOnlyCommand("FLOWPOINT TRUE\n"), "FLOWPOINT TRUE\n");
assert.throws(() => normalizeReadOnlyCommand("ACQAZ ORD1,STLAM,1,5.75"), /DIRECTA_WRITE_COMMAND_BLOCKED/);
assert.throws(() => normalizeReadOnlyCommand("MODORD ORD1,5.65"), /DIRECTA_WRITE_COMMAND_BLOCKED/);
assert.throws(() => normalizeReadOnlyCommand("CLOSEDARWIN"), /DIRECTA_WRITE_COMMAND_BLOCKED/);
assert.throws(() => normalizeReadOnlyCommand("WHATEVER"), /DIRECTA_COMMAND_NOT_WHITELISTED/);
assert.equal(isForbiddenDirectaWriteCommand("VENMARK ORD1,STLAM,1"), true);

const ports = parsePortSettings("55351;10001;10002;10003\n41000;10005;10006;10007\n");
assert.equal(ports.length, 2);
assert.equal(selectTradingPort(ports, "41000"), 10006);
assert.throws(() => selectTradingPort(ports), /DIRECTA_MULTIPLE_ACCOUNTS/);
assert.equal(selectTradingPort([], undefined), 10002);

assert.equal(mapDirectaOrderState(2003), "FILLED");
assert.equal(mapDirectaOrderState(2006), "MODIFIED");

const status = parseDirectaLine("DARWIN_STATUS;CONN_OK;TRUE;Release 1.2.1 build test");
assert.deepEqual(status, {
  kind: "status",
  connectionState: "CONN_OK",
  datafeedEnabled: true,
  release: "Release 1.2.1 build test",
});

const account = parseDirectaLine("INFOACCOUNT;12:49:11;40000;150000;1200;430;152630");
assert.equal(account?.kind, "account");
assert.equal(account?.kind === "account" ? account.accountIdentifierPresent : false, true);
assert.equal(account?.kind === "account" ? account.liquidity : null, 150000);

const position = parseDirectaLine("STOCK;STLAM;13:37:20;10;0;-1;4.2;12");
assert.equal(position?.kind, "stock");
assert.equal(position?.kind === "stock" ? position.portfolioQuantity : null, 10);

const order = parseDirectaLine("ORDER;A2A;10:51:32;ORD105037;ACQAZ;1.345;0.0;1;2003;1.3400;1.3440;0;P3710513238520");
assert.equal(order?.kind, "order");
assert.equal(order?.kind === "order" ? order.state : null, "FILLED");
assert.equal(order?.kind === "order" ? order.executedPrice : null, 1.344);
assert.equal(order?.kind === "order" ? order.brokerReference : null, "P3710513238520");

const tradOk = parseDirectaLine("TRADOK;A2A;ORD105037;3001;ACQAZ;1;1.345;0.0;1.3440;1;0;P3710513238520");
assert.equal(tradOk?.kind, "trading-result");
assert.equal(tradOk?.kind === "trading-result" ? tradOk.executedQuantity : null, 1);
assert.equal(tradOk?.kind === "trading-result" ? tradOk.residualQuantity : null, 0);

const messages = [
  parseDirectaLine("DARWIN_STATUS;CONN_OK;TRUE;Release test"),
  parseDirectaLine("INFOACCOUNT;12:49:11;40000;150000;1200;430;152630"),
  parseDirectaLine("AVAILABILITY;14:47:04;1000;5000;0;0;5000"),
  parseDirectaLine("BEGIN STOCKLIST"),
  parseDirectaLine("STOCK;STLAM;13:37:20;10;0;;4.2;12"),
  parseDirectaLine("END STOCKLIST"),
  parseDirectaLine("BEGIN ORDERLIST"),
  parseDirectaLine("ORDER;STLAM;16:20:40;ORD1;ACQAZ;4.75;0.0;10;2000;0;0;10;P1"),
  parseDirectaLine("END ORDERLIST"),
].filter(Boolean);

const snapshot = reduceDirectaMessages(messages, 10002);
assert.equal(snapshot.mode, "read-only");
assert.equal(snapshot.liveTradingAllowed, false);
assert.equal(snapshot.writeCommandsBlocked, true);
assert.equal(snapshot.connection.healthy, true);
assert.equal(snapshot.account?.identifierPersisted, false);
assert.equal(snapshot.positions.length, 1);
assert.equal(snapshot.orders.length, 1);
assert.equal(snapshot.diagnostics.stockListComplete, true);
assert.equal(snapshot.diagnostics.orderListComplete, true);
assert.equal(JSON.stringify(snapshot).includes("40000"), false, "Raw Directa account code must not be persisted in the snapshot.");

const disconnected = reduceDirectaMessages([
  parseDirectaLine("DARWIN_STATUS;CONN_OK;TRUE;Release test"),
  parseDirectaLine("ERR;N/A;1024"),
].filter(Boolean), 10002);
assert.equal(disconnected.connection.healthy, false);

console.log("Fenice Directa read-only protocol tests: PASS");
