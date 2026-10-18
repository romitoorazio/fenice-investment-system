import net from "node:net";
import { assertLoopbackHost, normalizeReadOnlyCommand, parseDirectaLine } from "./directa-protocol.ts";
import { reduceDirectaMessages, resolveLocalDirectaTradingPort } from "./directa-readonly.ts";

// Local diagnostic only. The frozen PAPER collector and its consumers are unchanged.
// A startup 1019 can describe a filtered list of cancelled orders. Only an explicit,
// unfiltered ORDERLIST response after the option acknowledgements proves emptiness.
export async function collectDirectaLocalReadOnlySnapshot(config = {}) {
  const host = config.host ?? "127.0.0.1";
  assertLoopbackHost(host);
  const tradingPort = await resolveLocalDirectaTradingPort(config);
  const timeoutMs = config.snapshotTimeoutMs ?? 10_000;
  const connectTimeoutMs = config.connectTimeoutMs ?? 2_500;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000
    || !Number.isSafeInteger(connectTimeoutMs) || connectTimeoutMs < 250 || connectTimeoutMs > 10_000) {
    throw new Error("DIRECTA_INVALID_LOCAL_TIMEOUT");
  }

  return await new Promise((resolve, reject) => {
    const messages = [];
    const notices = [];
    const failures = new Set();
    const lists = {
      stocks: { begun: false, rows: 0, completion: null, endSeen: false },
      orders: { begun: false, rows: 0, completion: null, endSeen: false },
    };
    let phase = "FLOWPOINT";
    let readingBatch = false;
    let pendingCommand = null;
    let listsRequested = false;
    let receivedMessages = 0;
    let buffer = "";
    let settled = false;
    let finalStatusReceived = false;
    let connectionReadyBeforeRead = false;
    let initialUnavailableObserved = 0;
    let warmupRetries = 0;
    let drainTimer;
    let warmupTimer;
    const socket = net.createConnection({ host, port: tradingPort });

    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(snapshotTimer);
      clearTimeout(drainTimer);
      clearTimeout(warmupTimer);
      socket.destroy();
    };
    const finish = (failure) => {
      if (settled) return;
      if (failure) failures.add(failure);
      if (buffer.trim()) failures.add("UNTERMINATED_PROTOCOL_LINE");
      settled = true;
      cleanup();
      const snapshot = reduceDirectaMessages(messages, tradingPort);
      const sequenceComplete = phase === "COMPLETE" && connectionReadyBeforeRead
        && finalStatusReceived && failures.size === 0;
      // These are observed completion methods, never synthetic BEGIN/END messages.
      // A failed sequence cannot satisfy existing reconciliation/continuity consumers.
      snapshot.diagnostics.stockListComplete = sequenceComplete && lists.stocks.completion !== null;
      snapshot.diagnostics.orderListComplete = sequenceComplete && lists.orders.completion !== null;
      snapshot.diagnostics.receivedMessages = receivedMessages;
      snapshot.diagnostics.localReadOnly = {
        version: 1,
        diagnosticOnly: true,
        sequenceComplete,
        finalStatusReceived,
        connectionReadyBeforeRead,
        initialUnavailableObserved,
        warmupRetries,
        stockListCompletion: lists.stocks.completion,
        orderListCompletion: lists.orders.completion,
        notices,
        failures: [...failures],
      };
      resolve(snapshot);
    };
    const fail = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(code));
    };
    const send = (nextPhase, command) => {
      // All bytes already received predate the next command. Drain complete
      // lines AND any partial line before it can become an eligible response.
      if (readingBatch || buffer.length !== 0) {
        pendingCommand = { nextPhase, command };
        phase = "BETWEEN_REQUESTS";
        return;
      }
      phase = nextPhase;
      if (nextPhase === "INFOSTOCKS") listsRequested = true;
      socket.write(normalizeReadOnlyCommand(command));
    };
    const advanceList = (name, completion) => {
      lists[name].completion = completion;
      if (name === "stocks") send("ORDERLIST", "ORDERLIST");
      else send("FINAL_STATUS", "DARWINSTATUS");
    };
    const waitForConnection = () => {
      phase = "WAIT_READY";
      clearTimeout(warmupTimer);
      warmupTimer = setTimeout(() => {
        if (settled || connectionReadyBeforeRead || phase !== "WAIT_READY") return;
        warmupRetries += 1;
        send("STATUS", "DARWINSTATUS");
      }, 500);
    };

    const consumeLine = (line) => {
      if (settled) return;
      const message = parseDirectaLine(line);
      if (!message) return;
      receivedMessages += 1;
      if (receivedMessages > 50_000) return finish("PROTOCOL_MESSAGE_LIMIT");
      if (message.kind === "heartbeat") { messages.push(message); return; }
      const startup = !listsRequested;

      if (message.kind === "error") {
        if (startup && (message.code === 1018 || message.code === 1019)) {
          notices.push({ code: message.code, responseTo: "STARTUP_NOT_PROOF_OF_EMPTY_LIST" });
          return;
        }
        const name = phase === "INFOSTOCKS" && message.code === 1018 ? "stocks"
          : phase === "ORDERLIST" && message.code === 1019 ? "orders" : null;
        if (name && lists[name].rows === 0 && lists[name].completion === null) {
          notices.push({ code: message.code, responseTo: phase });
          advanceList(name, `EMPTY_RESPONSE_${message.code}`);
          return;
        }
        messages.push(message);
        failures.add("BROKER_ERROR_OR_CONTRADICTORY_EMPTY_RESPONSE");
        return;
      }
      if (message.kind === "option") {
        if (phase === "FLOWPOINT" && message.name === "FLOWPOINT" && message.value === "TRUE") {
          send("PRICEEXE", "PRICEEXE TRUE");
        } else if (phase === "PRICEEXE" && message.name === "PRICEEXE" && message.value === "TRUE") {
          send("STATUS", "DARWINSTATUS");
        } else {
          failures.add("UNEXPECTED_OPTION_RESPONSE");
        }
        return;
      }
      if (message.kind === "status") {
        messages.push(message);
        if (message.connectionState !== "CONN_OK") {
          // Darwin's socket can initially report UNAVAILABLE while its trading
          // session initializes (~1 s observed on Windows). Read nothing until
          // an explicit healthy status; all other errors remain blocking.
          if (message.connectionState === "CONN_UNAVAILABLE" && !connectionReadyBeforeRead) {
            initialUnavailableObserved += 1;
            if (phase === "STATUS") waitForConnection();
            return;
          }
          // Once a read starts, loss cannot be repaired by a later OK: a new
          // invocation must re-collect the entire account and both lists.
          return finish("BROKER_CONNECTION_CHANGED");
        }
        if (phase === "STATUS") {
          clearTimeout(warmupTimer);
          connectionReadyBeforeRead = true;
          send("ACCOUNT", "INFOACCOUNT");
        }
        else if (phase === "FINAL_STATUS") {
          phase = "COMPLETE";
          finalStatusReceived = message.connectionState === "CONN_OK";
          // Consume the rest of this TCP batch and any trailing marker/error.
          drainTimer = setTimeout(() => finish(), 100);
        } else if (!startup) failures.add("UNEXPECTED_STATUS_RESPONSE");
        return;
      }
      if (message.kind === "account") {
        if (phase === "ACCOUNT") {
          messages.push(message);
          send("AVAILABILITY", "INFOAVAILABILITY");
        } else if (!startup) failures.add("ACCOUNT_CHANGED_DURING_READ");
        return;
      }
      if (message.kind === "availability") {
        if (phase === "AVAILABILITY") {
          messages.push(message);
          send("INFOSTOCKS", "INFOSTOCKS");
        } else if (!startup) failures.add("AVAILABILITY_CHANGED_DURING_READ");
        return;
      }
      if (message.kind === "stock" || message.kind === "order") {
        if (startup) return; // Only the subsequent explicit requests supply rows.
        const name = message.kind === "stock" ? "stocks" : "orders";
        const expectedPhase = name === "stocks" ? "INFOSTOCKS" : "ORDERLIST";
        if (phase !== expectedPhase || !lists[name].begun || message.update
          || lists[name].completion !== null) {
          failures.add("UNSCOPED_OR_CHANGED_LIST_ROW");
        } else {
          lists[name].rows += 1;
          messages.push(message);
        }
        return;
      }
      if (message.kind === "marker") {
        const marker = /^(BEGIN|END) (STOCKLIST|ORDERLIST)$/.exec(message.value);
        if (!marker) { failures.add("UNEXPECTED_LIST_MARKER"); return; }
        if (startup) return;
        const name = marker[2] === "STOCKLIST" ? "stocks" : "orders";
        const list = lists[name];
        const expectedPhase = name === "stocks" ? "INFOSTOCKS" : "ORDERLIST";
        // Some Darwin versions also terminate an empty ERR response with END.
        if (marker[1] === "END" && list.completion?.startsWith("EMPTY_RESPONSE_") && !list.endSeen) {
          list.endSeen = true;
          return;
        }
        if (phase !== expectedPhase || list.completion !== null) {
          failures.add("UNSCOPED_LIST_MARKER");
        } else if (marker[1] === "BEGIN" && !list.begun) {
          list.begun = true;
          messages.push(message);
        } else if (marker[1] === "END" && list.begun && !list.endSeen) {
          list.endSeen = true;
          messages.push(message);
          advanceList(name, "FLOWPOINT_END");
        } else {
          failures.add("INVALID_LIST_MARKER_SEQUENCE");
        }
        return;
      }
      failures.add(message.kind === "trading-result" ? "UNEXPECTED_TRADING_RESULT" : "UNKNOWN_PROTOCOL_MESSAGE");
      messages.push(message);
    };

    const connectTimer = setTimeout(() => fail("DIRECTA_CONNECT_TIMEOUT"), connectTimeoutMs);
    const snapshotTimer = setTimeout(() => finish("LOCAL_READ_SEQUENCE_TIMEOUT"), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      clearTimeout(connectTimer);
      send("FLOWPOINT", "FLOWPOINT TRUE");
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1_000_000) return finish("PROTOCOL_BUFFER_LIMIT");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      readingBatch = true;
      for (const line of lines) consumeLine(line);
      readingBatch = false;
      // A fragment may continue on a later data event. Until it has been drained,
      // keep the next request unsent and all those bytes in BETWEEN_REQUESTS.
      if (!settled && pendingCommand && buffer.length === 0) {
        const next = pendingCommand;
        pendingCommand = null;
        send(next.nextPhase, next.command);
      }
    });
    socket.on("error", () => fail("DIRECTA_LOCAL_SOCKET_ERROR"));
    socket.on("close", () => {
      if (!settled) finish(phase === "COMPLETE" ? undefined : "LOCAL_READ_SEQUENCE_INTERRUPTED");
    });
  });
}
