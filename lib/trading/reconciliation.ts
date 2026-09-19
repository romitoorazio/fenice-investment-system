import type { PaperExecution, Position, ReconciliationReport } from "./types.ts";

export function reconcilePaperExecutions(
  openingPositions: Position[],
  executions: PaperExecution[],
  actualPositions: Position[],
): ReconciliationReport {
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();

  for (const position of openingPositions) {
    expected.set(position.symbol.toUpperCase(), Number(position.quantity) || 0);
  }

  for (const execution of executions) {
    if (execution.status !== "PAPER_FILLED") continue;
    const symbol = execution.symbol.toUpperCase();
    const signedQuantity = execution.side === "BUY" ? execution.filledQuantity : -execution.filledQuantity;
    expected.set(symbol, (expected.get(symbol) ?? 0) + signedQuantity);
  }

  for (const position of actualPositions) {
    actual.set(position.symbol.toUpperCase(), Number(position.quantity) || 0);
  }

  const symbols = new Set([...expected.keys(), ...actual.keys()]);
  const breaks = [...symbols]
    .map((symbol) => {
      const expectedQuantity = expected.get(symbol) ?? 0;
      const actualQuantity = actual.get(symbol) ?? 0;
      return {
        symbol,
        expectedQuantity: Number(expectedQuantity.toFixed(8)),
        actualQuantity: Number(actualQuantity.toFixed(8)),
        difference: Number((actualQuantity - expectedQuantity).toFixed(8)),
      };
    })
    .filter((item) => Math.abs(item.difference) > 1e-8);

  return {
    balanced: breaks.length === 0,
    breaks,
  };
}
