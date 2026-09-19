import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";

const dir = await mkdtemp(path.join(os.tmpdir(), "fenice-state-"));
const statePath = path.join(dir, "state.json");
try {
  const fallback = { version: 0, status: "fallback" };
  assert.deepEqual(await readJsonState(statePath, fallback), fallback);

  await writeJsonStateAtomic(statePath, { version: 1, status: "first" });
  assert.deepEqual(await readJsonState(statePath, fallback), { version: 1, status: "first" });

  await writeJsonStateAtomic(statePath, { version: 2, status: "second" });
  assert.deepEqual(await readJsonState(statePath, fallback), { version: 2, status: "second" });
  assert.deepEqual(JSON.parse(await readFile(`${statePath}.bak`, "utf8")), { version: 1, status: "first" });

  await writeFile(statePath, '{"version":3,"status":', "utf8");
  await assert.rejects(readJsonState(statePath, fallback), SyntaxError);
  assert.deepEqual(JSON.parse(await readFile(`${statePath}.bak`, "utf8")), { version: 1, status: "first" });

  console.log("Fenice atomic state persistence tests: PASS");
} finally {
  await rm(dir, { recursive: true, force: true });
}
