import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const graphPath = path.join(root, "data", "knowledge-graph.json");

function runPreviousPipeline() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-internet-orchestrator.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Internet orchestrator exited with ${code}`)));
  });
}

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
const key = (type, value) => `${type}:${normalize(value).toLowerCase().replace(/[^a-z0-9à-ž._-]+/gi, "-")}`;

const EVENT_RULES = [
  { type: "CYBER_INCIDENT", category: "CYBER", terms: ["ransomware", "breach", "exploit", "cve", "vulnerability", "malware", "cyber"] },
  { type: "REGULATORY", category: "REGULATION", terms: ["sec", "filing", "regulation", "approval", "authorized", "ban", "sanction", "lawsuit"] },
  { type: "CAPITAL_MARKETS", category: "MARKETS", terms: ["ipo", "s-1", "f-1", "listing", "offering", "funding", "acquisition", "merger"] },
  { type: "BIOTECH_MILESTONE", category: "BIOTECH", terms: ["clinical trial", "phase 1", "phase 2", "phase 3", "fda", "crispr", "therapy", "drug"] },
  { type: "MACRO_SHIFT", category: "MACRO", terms: ["inflation", "interest rate", "yield", "treasury", "gdp", "recession", "employment", "liquidity"] },
  { type: "TECH_BREAKTHROUGH", category: "TECHNOLOGY", terms: ["artificial intelligence", " ai ", "quantum", "robotics", "semiconductor", "battery", "patent"] },
  { type: "CRYPTO_SIGNAL", category: "CRYPTO", terms: ["bitcoin", "ethereum", "crypto", "token", "blockchain"] },
];

function classifyEvent(text, fallbackCategory) {
  const haystack = ` ${String(text || "").toLowerCase()} `;
  const match = EVENT_RULES.find((rule) => rule.terms.some((term) => haystack.includes(term)));
  return match || { type: "GENERAL_EVENT", category: fallbackCategory || "GENERAL", terms: [] };
}

function extractEntities(text) {
  const input = normalize(text);
  if (!input) return [];
  const tokens = input.match(/\b[A-Z][A-Za-z0-9&.-]{2,}(?:\s+[A-Z][A-Za-z0-9&.-]{2,}){0,3}\b/g) || [];
  const stop = new Set(["The", "This", "That", "Fenice", "Internet", "World Bank", "Hacker News"]);
  return [...new Set(tokens.map(normalize).filter((item) => item.length >= 3 && !stop.has(item)))].slice(0, 12);
}

function addNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, { ...node, mentions: 1, firstSeenAt: node.seenAt, lastSeenAt: node.seenAt });
    return;
  }
  existing.mentions += 1;
  existing.lastSeenAt = node.seenAt || existing.lastSeenAt;
  existing.score = Math.max(existing.score || 0, node.score || 0);
  existing.risk = Math.max(existing.risk || 0, node.risk || 0);
}

function addEdge(edges, from, to, relation, weight = 1, evidence) {
  if (!from || !to || from === to) return;
  const id = `${from}|${relation}|${to}`;
  const existing = edges.get(id);
  if (!existing) {
    edges.set(id, { id, from, to, relation, weight, evidence: evidence ? [evidence] : [] });
    return;
  }
  existing.weight = Number((existing.weight + weight).toFixed(3));
  if (evidence && existing.evidence.length < 5) existing.evidence.push(evidence);
}

function buildGraph(snapshot) {
  const nodes = new Map();
  const edges = new Map();
  const events = [];
  const now = new Date().toISOString();

  for (const market of Array.isArray(snapshot.markets) ? snapshot.markets : []) {
    const symbol = normalize(market.symbol || market.name);
    if (!symbol) continue;
    const instrumentId = key("instrument", symbol);
    const assetClass = normalize(market.assetClass || market.type || "UNKNOWN");
    const source = normalize(market.source || "Unknown source");
    addNode(nodes, { id: instrumentId, type: "INSTRUMENT", label: symbol, score: Number(market.score || 50), risk: Number(market.risk || 50), seenAt: market.updatedAt || now });
    const classId = key("asset-class", assetClass);
    addNode(nodes, { id: classId, type: "ASSET_CLASS", label: assetClass, score: 50, risk: 40, seenAt: now });
    addEdge(edges, instrumentId, classId, "BELONGS_TO", 1, source);
    const sourceId = key("source", source);
    addNode(nodes, { id: sourceId, type: "SOURCE", label: source, score: 60, risk: 20, seenAt: now });
    addEdge(edges, sourceId, instrumentId, "OBSERVES", 1, `${market.price ?? "n/d"}`);
  }

  const discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
  for (const item of discoveries) {
    const title = normalize(item.name || item.title);
    const signal = normalize(item.signal || item.summary);
    if (!title) continue;
    const classification = classifyEvent(`${title} ${signal}`, item.category);
    const eventId = key("event", item.id || `${title}-${item.date || "latest"}`);
    const eventScore = clamp(Number(item.score || 50));
    const eventRisk = clamp(Number(item.risk || 60));
    const date = item.date || item.createdAt || now;
    addNode(nodes, { id: eventId, type: "EVENT", label: title, subtype: classification.type, category: classification.category, score: eventScore, risk: eventRisk, seenAt: date });

    const categoryId = key("theme", classification.category);
    addNode(nodes, { id: categoryId, type: "THEME", label: classification.category, score: 55, risk: 50, seenAt: date });
    addEdge(edges, eventId, categoryId, "CLASSIFIED_AS", 1, item.source);

    const source = normalize(item.source || "Internet source");
    const sourceId = key("source", source);
    addNode(nodes, { id: sourceId, type: "SOURCE", label: source, score: 60, risk: 25, seenAt: date });
    addEdge(edges, sourceId, eventId, "REPORTED", 1, item.url);

    const entities = extractEntities(`${title}. ${signal}`);
    for (const entity of entities) {
      const entityId = key("entity", entity);
      addNode(nodes, { id: entityId, type: "ENTITY", label: entity, score: eventScore, risk: eventRisk, seenAt: date });
      addEdge(edges, eventId, entityId, "MENTIONS", 1, item.url);
      addEdge(edges, entityId, categoryId, "EXPOSED_TO", Number((eventScore / 100).toFixed(2)), title);
    }

    events.push({
      id: eventId,
      title,
      type: classification.type,
      category: classification.category,
      score: eventScore,
      risk: eventRisk,
      date,
      source,
      entities,
      url: item.url,
    });
  }

  const entityNodes = [...nodes.values()].filter((node) => node.type === "ENTITY");
  for (let i = 0; i < entityNodes.length; i += 1) {
    for (let j = i + 1; j < entityNodes.length; j += 1) {
      const left = entityNodes[i];
      const right = entityNodes[j];
      const sharedEvents = events.filter((event) => event.entities.includes(left.label) && event.entities.includes(right.label));
      if (sharedEvents.length > 0) addEdge(edges, left.id, right.id, "CO_OCCURS_WITH", sharedEvents.length, sharedEvents[0].title);
    }
  }

  const rankedEvents = [...events].sort((a, b) => (b.score * 0.6 + b.risk * 0.4) - (a.score * 0.6 + a.risk * 0.4));
  const rankedEntities = [...nodes.values()]
    .filter((node) => node.type === "ENTITY" || node.type === "INSTRUMENT")
    .map((node) => ({ ...node, influence: Math.round(clamp((node.score || 0) * 0.55 + (node.risk || 0) * 0.25 + Math.min(20, node.mentions * 2))) }))
    .sort((a, b) => b.influence - a.influence);

  return {
    generatedAt: now,
    version: 1,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    events: rankedEvents,
    rankings: {
      influentialEntities: rankedEntities.slice(0, 100),
      criticalEvents: rankedEvents.slice(0, 100),
    },
    metrics: {
      nodeCount: nodes.size,
      edgeCount: edges.size,
      eventCount: events.length,
      entityCount: entityNodes.length,
      sourceCount: [...nodes.values()].filter((node) => node.type === "SOURCE").length,
      instrumentCount: [...nodes.values()].filter((node) => node.type === "INSTRUMENT").length,
    },
    policy: {
      evidenceRequired: true,
      provenancePreserved: true,
      inferredRelationsAreLabeled: true,
      autonomousTrading: false,
    },
  };
}

async function main() {
  await runPreviousPipeline();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const graph = buildGraph(snapshot);
  snapshot.knowledgeGraph = {
    generatedAt: graph.generatedAt,
    ...graph.metrics,
    topEntities: graph.rankings.influentialEntities.slice(0, 20),
    topEvents: graph.rankings.criticalEvents.slice(0, 20),
    autonomousTrading: false,
  };
  snapshot.reportVersion = Math.max(Number(snapshot.reportVersion || snapshot.version || 0) + 1, 15);
  snapshot.headline = `${snapshot.markets?.length || 0} strumenti, ${snapshot.discoveries?.length || 0} segnali, ${graph.metrics.eventCount} eventi e ${graph.metrics.edgeCount} relazioni analizzate.`;
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Fenice Knowledge Engine: ${graph.metrics.nodeCount} nodes, ${graph.metrics.edgeCount} edges, ${graph.metrics.eventCount} events.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
