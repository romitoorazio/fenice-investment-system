import assert from "node:assert/strict";
import { catalystMatchesAsset } from "../lib/intelligence/catalyst-matching.mjs";

const ethereum = { symbol: "ETH", name: "Ethereum" };

for (const discovery of [
  { name: "Temporal Gradient Inversion", signal: "A new method for private reconstruction" },
  { name: "Quantum Feature Selection", signal: "Biomedical methods and algorithms" },
  { name: "Ethena update", signal: "A different crypto asset" },
  { name: "Bethany Systems", signal: "Unrelated company announcement" },
]) {
  assert.equal(
    catalystMatchesAsset(ethereum, discovery),
    false,
    `substring-only evidence must not match ETH: ${discovery.name}`,
  );
}

assert.equal(
  catalystMatchesAsset(ethereum, { name: "Ethereum upgrade", signal: "Protocol release" }),
  true,
  "full asset name must match",
);
assert.equal(
  catalystMatchesAsset(ethereum, { name: "ETH staking update", signal: "Protocol release" }),
  true,
  "standalone ticker must match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "NVDA", name: "NVIDIA CORP" },
    { name: "NVIDIA announces platform update", signal: "Company release" },
  ),
  true,
  "meaningful company-name tokens must match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "TSM", name: "Taiwan Semiconductor Manufacturing Company Limited" },
    { name: "Unrelated semiconductor supplier update", signal: "Sector news" },
  ),
  false,
  "generic sector words in a company name must not create cross-company evidence",
);

console.log("Fenice Investment Committee catalyst matching regression: PASS");
