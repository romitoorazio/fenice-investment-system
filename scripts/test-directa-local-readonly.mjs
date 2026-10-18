import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { collectDirectaLocalReadOnlySnapshot as collect } from "../lib/brokers/directa-local-readonly.mjs";
import { assessDirectaLocalSnapshotEvidence as assess } from "../lib/ui/directa-local-snapshot-evidence.mjs";

const status = "DARWIN_STATUS;CONN_OK;FALSE;Test release\n";
const account = "INFOACCOUNT;17:00:07;PRIVATE_ACCOUNT;12345;0;0;12345\n";
const availability = "AVAILABILITY;17:00:07;12345;12345;0;0;12345\n";
const stock = "STOCK;PRIVATE_STOCK;17:00:07;2;0;;50;0\n";
const order = "ORDER;PRIVATE_ORDER;17:00:07;PRIVATE_ID;ACQAZ;50;0;1;2004;0;0;0;PRIVATE_REFERENCE\n";
const startup = status + account + availability + "ERR;N/A;1018\nERR;N/A;1019\n";
const expectedCommands = [
  "FLOWPOINT TRUE", "PRICEEXE TRUE", "DARWINSTATUS", "INFOACCOUNT",
  "INFOAVAILABILITY", "INFOSTOCKS", "ORDERLIST", "DARWINSTATUS",
];
let scenarios = 0;

async function observe(overrides = {}, options = {}) {
  const commands = [];
  const sockets = new Set();
  let statusCalls = 0;
  const responses = {
    "FLOWPOINT TRUE": "FLOWPOINT;TRUE\n",
    "PRICEEXE TRUE": "PRICEEXE;TRUE\n",
    DARWINSTATUS: () => (++statusCalls === 1 ? status : (options.finalStatus ?? status)),
    INFOACCOUNT: account,
    INFOAVAILABILITY: availability,
    INFOSTOCKS: "ERR;N/A;1018\n",
    ORDERLIST: "ERR;N/A;1019\n",
    ...overrides,
  };
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    socket.write(options.startup ?? startup);
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const command = line.trim();
        commands.push(command);
        const response = responses[command];
        if (response === undefined) { socket.destroy(); continue; }
        const text = typeof response === "function" ? response(socket) : response;
        if (text) {
          // Exercise partial lines and CRLF, not only one-message TCP packets.
          const wire = options.crlf ? text.replaceAll("\n", "\r\n") : text;
          if (options.fragment) {
            const middle = Math.floor(wire.length / 2);
            socket.write(wire.slice(0, middle));
            setImmediate(() => { if (!socket.destroyed) socket.write(wire.slice(middle)); });
          } else socket.write(wire);
        }
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const snapshot = await collect({
      host: "127.0.0.1", tradingPort: server.address().port,
      snapshotTimeoutMs: 500, connectTimeoutMs: 250,
    });
    scenarios += 1;
    assert.deepEqual(commands, expectedCommands.slice(0, commands.length), "Only the fixed, ordered read-only commands may be sent");
    assert.equal(snapshot.liveTradingAllowed, false);
    assert.equal(snapshot.writeCommandsBlocked, true);
    if (snapshot.account) assert.equal(snapshot.account.identifierPersisted, false);
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE_ACCOUNT"), false);
    return { snapshot, commands, integrity: assess(snapshot) };
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function complete(result) {
  assert.equal(result.integrity.state, "CURRENT_COMPLETE");
  assert.deepEqual(result.commands, expectedCommands);
  assert.deepEqual(result.snapshot.errors, []);
  assert.equal(result.integrity.brokerReconciliationVerified, false);
  assert.equal(result.integrity.brokerWritesAuthorized, false);
}
function blocked(result, reason) {
  assert.equal(result.integrity.complete, false, reason);
  assert.equal(result.snapshot.diagnostics.stockListComplete, false, reason);
  assert.equal(result.snapshot.diagnostics.orderListComplete, false, reason);
  if (reason) assert.ok(result.snapshot.diagnostics.localReadOnly.failures.includes(reason), reason);
}

// Actual reported case: empty notices occur both at startup and on explicit reads.
const empty = await observe();
complete(empty);
assert.equal(empty.snapshot.connection.datafeedEnabled, false, "Paid market data is not required to read the account");
assert.equal(empty.snapshot.positions.length, 0);
assert.equal(empty.snapshot.orders.length, 0);
assert.equal(empty.snapshot.diagnostics.localReadOnly.stockListCompletion, "EMPTY_RESPONSE_1018");
assert.equal(empty.snapshot.diagnostics.localReadOnly.orderListCompletion, "EMPTY_RESPONSE_1019");
assert.deepEqual(empty.snapshot.diagnostics.localReadOnly.notices, [
  { code: 1018, responseTo: "STARTUP_NOT_PROOF_OF_EMPTY_LIST" },
  { code: 1019, responseTo: "STARTUP_NOT_PROOF_OF_EMPTY_LIST" },
  { code: 1018, responseTo: "INFOSTOCKS" },
  { code: 1019, responseTo: "ORDERLIST" },
]);

const full = await observe({
  INFOSTOCKS: "BEGIN STOCKLIST\n" + stock + "END STOCKLIST\n",
  ORDERLIST: "BEGIN ORDERLIST\n" + order + "END ORDERLIST\n",
}, { fragment: true, crlf: true });
complete(full);
assert.equal(full.snapshot.positions.length, 1);
assert.equal(full.snapshot.orders.length, 1);
assert.equal(full.snapshot.diagnostics.localReadOnly.orderListCompletion, "FLOWPOINT_END");

// The documented initial >=100 cancelled-order filter must never erase real orders.
const filteredStartup = await observe({ ORDERLIST: "BEGIN ORDERLIST\n" + order + "END ORDERLIST\n" }, {
  startup: status + account + availability + "ERR;N/A;1019\n",
});
complete(filteredStartup);
assert.equal(filteredStartup.snapshot.orders.length, 1);
assert.equal(filteredStartup.snapshot.diagnostics.localReadOnly.orderListCompletion, "FLOWPOINT_END");

const markedEmpty = await observe({
  INFOSTOCKS: "BEGIN STOCKLIST\nEND STOCKLIST\n",
  ORDERLIST: "BEGIN ORDERLIST\nEND ORDERLIST\n",
});
complete(markedEmpty);
assert.equal(markedEmpty.snapshot.diagnostics.localReadOnly.stockListCompletion, "FLOWPOINT_END");
complete(await observe({
  INFOSTOCKS: "BEGIN STOCKLIST\nERR;N/A;1018\nEND STOCKLIST\n",
  ORDERLIST: "BEGIN ORDERLIST\nERR;N/A;1019\nEND ORDERLIST\n",
}));

// Startup notices alone never prove a list was read, even with a healthy socket.
blocked(await observe({ INFOSTOCKS: "" }), "LOCAL_READ_SEQUENCE_TIMEOUT");
blocked(await observe({ ORDERLIST: "" }), "LOCAL_READ_SEQUENCE_TIMEOUT");
blocked(await observe({ "FLOWPOINT TRUE": "" }), "LOCAL_READ_SEQUENCE_TIMEOUT");
blocked(await observe({ "PRICEEXE TRUE": "" }), "LOCAL_READ_SEQUENCE_TIMEOUT");
blocked(await observe({}, { finalStatus: "" }), "LOCAL_READ_SEQUENCE_TIMEOUT");
blocked(await observe({ INFOSTOCKS: (socket) => { socket.end(); } }), "LOCAL_READ_SEQUENCE_INTERRUPTED");
blocked(await observe({ INFOSTOCKS: "END STOCKLIST\n" }), "INVALID_LIST_MARKER_SEQUENCE");
blocked(await observe({ INFOSTOCKS: stock + "END STOCKLIST\n" }), "UNSCOPED_OR_CHANGED_LIST_ROW");
blocked(await observe({ ORDERLIST: "BEGIN ORDERLIST\n" + order + "ERR;N/A;1019\nEND ORDERLIST\n" }), "BROKER_ERROR_OR_CONTRADICTORY_EMPTY_RESPONSE");
blocked(await observe({ INFOSTOCKS: "ERR;N/A;1018\n" + stock }), "UNSCOPED_OR_CHANGED_LIST_ROW");
blocked(await observe({}, { finalStatus: status + order }), "UNSCOPED_OR_CHANGED_LIST_ROW");
blocked(await observe({}, { finalStatus: "DARWIN_STATUS;CONN_LOST;FALSE;Test\n" }), "BROKER_CONNECTION_CHANGED");
blocked(await observe({}, { finalStatus: status + "ERR;N/A;1024\n" }), "BROKER_ERROR_OR_CONTRADICTORY_EMPTY_RESPONSE");
blocked(await observe({ "FLOWPOINT TRUE": "FLOWPOINT;FALSE\n" }), "UNEXPECTED_OPTION_RESPONSE");
blocked(await observe({ ORDERLIST: "ERR;N/A;1003\n" }), "BROKER_ERROR_OR_CONTRADICTORY_EMPTY_RESPONSE");
blocked(await observe({ ORDERLIST: "ERR;N/A;1018\n" }), "BROKER_ERROR_OR_CONTRADICTORY_EMPTY_RESPONSE");
// A packet predates any request triggered while processing that packet. Its
// buffered lines (including fragments) cannot answer the next explicit request.
const bufferedEmpty = await observe({ INFOSTOCKS: "ERR;N/A;1018\nERR;N/A;1019\n", ORDERLIST: "" });
blocked(bufferedEmpty);
assert.equal(bufferedEmpty.snapshot.diagnostics.localReadOnly.orderListCompletion, null);
let fragmentDelivered = false;
let orderRequestedAfterFragment = false;
const fragmentedEmpty = await observe({
  INFOSTOCKS: (socket) => {
    socket.write("ERR;N/A;1018\nERR;N/A;101");
    setTimeout(() => {
      fragmentDelivered = true;
      if (!socket.destroyed) socket.write("9\n");
    }, 20);
  },
  ORDERLIST: () => { orderRequestedAfterFragment = fragmentDelivered; return ""; },
});
blocked(fragmentedEmpty);
assert.equal(orderRequestedAfterFragment, true, "Drain pre-request partial lines before sending the next command");
assert.equal(fragmentedEmpty.snapshot.diagnostics.localReadOnly.orderListCompletion, null);
blocked(await observe({ INFOACCOUNT: account + availability, INFOAVAILABILITY: "" }));
blocked(await observe({ "FLOWPOINT TRUE": "FLOWPOINT;TRUE\nPRICEEXE;TRUE\n", "PRICEEXE TRUE": "" }));
blocked(await observe({}, { finalStatus: status + "PRIVATE_UNKNOWN_TYPE;PRIVATE_VALUE\n" }), "UNKNOWN_PROTOCOL_MESSAGE");
blocked(await observe({}, { finalStatus: status + "UNTERMINATED" }), "UNTERMINATED_PROTOCOL_LINE");

const privacy = JSON.stringify(full.integrity);
for (const secret of ["PRIVATE_ACCOUNT", "PRIVATE_STOCK", "PRIVATE_ORDER", "PRIVATE_ID", "PRIVATE_REFERENCE", "12345"]) {
  assert.equal(privacy.includes(secret), false);
}
await assert.rejects(collect({ host: "192.168.1.10", tradingPort: 10002 }), /DIRECTA_LOOPBACK_ONLY/);
await assert.rejects(collect({ tradingPort: 10002, snapshotTimeoutMs: Number.NaN }), /DIRECTA_INVALID_LOCAL_TIMEOUT/);
await assert.rejects(collect({ tradingPort: 10002, connectTimeoutMs: Infinity }), /DIRECTA_INVALID_LOCAL_TIMEOUT/);
console.log(`Directa sequential local read-only: PASS (${scenarios} socket scenarios; no broker connection)`);
