const DEFAULT_TIMEOUT_MS = 15_000;

function finiteNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function requestJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "FeniceInvestmentSystem/3.5 institutional-source-validation",
      },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { data: await response.json(), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

function upsertProvider(snapshot, provider) {
  snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  snapshot.providers = snapshot.providers.filter((item) => item.id !== provider.id);
  snapshot.providers.push(provider);
}

function upsertMacro(snapshot, reading) {
  snapshot.macro = Array.isArray(snapshot.macro) ? snapshot.macro : [];
  snapshot.macro = snapshot.macro.filter((item) => item.id !== reading.id);
  snapshot.macro.push(reading);
}

function addDiscovery(snapshot, discovery) {
  snapshot.discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
  snapshot.discoveries = snapshot.discoveries.filter((item) => item.id !== discovery.id);
  snapshot.discoveries.push(discovery);
}

function pushHealth(health, item) {
  if (!Array.isArray(health)) return;
  const index = health.findIndex((entry) => entry.id === item.id);
  if (index >= 0) health.splice(index, 1);
  health.push(item);
}

function latestBlsObservation(payload) {
  const series = payload?.Results?.series?.[0];
  const rows = Array.isArray(series?.data) ? series.data : [];
  const row = rows.find((item) => /^M\d{2}$/.test(String(item?.period || "")) && finiteNumber(item?.value) !== undefined);
  return row ? { value: finiteNumber(row.value), date: `${row.year}-${String(row.period).slice(1).padStart(2, "0")}` } : null;
}

async function collectBls(snapshot, health) {
  const id = "bls";
  const started = Date.now();
  try {
    const [cpi, unemployment] = await Promise.all([
      requestJson("https://api.bls.gov/publicAPI/v1/timeseries/data/CUSR0000SA0"),
      requestJson("https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000"),
    ]);
    const cpiObservation = latestBlsObservation(cpi.data);
    const unemploymentObservation = latestBlsObservation(unemployment.data);
    if (!cpiObservation && !unemploymentObservation) throw new Error("BLS payload without usable observations");

    if (cpiObservation) {
      upsertMacro(snapshot, {
        id: "BLS_CPI_US",
        label: "CPI USA (BLS)",
        value: cpiObservation.value,
        date: cpiObservation.date,
        unit: "indice",
        source: "U.S. Bureau of Labor Statistics",
      });
    }
    if (unemploymentObservation) {
      upsertMacro(snapshot, {
        id: "BLS_UNEMPLOYMENT_US",
        label: "Disoccupazione USA (BLS)",
        value: unemploymentObservation.value,
        date: unemploymentObservation.date,
        unit: "%",
        source: "U.S. Bureau of Labor Statistics",
      });
    }

    const records = Number(Boolean(cpiObservation)) + Number(Boolean(unemploymentObservation));
    upsertProvider(snapshot, {
      id,
      name: "U.S. Bureau of Labor Statistics",
      state: records === 2 ? "operativo" : "parziale",
      coverage: ["inflazione USA", "mercato del lavoro USA", "validazione macro indipendente"],
      detail: `${records}/2 serie BLS acquisite via Public Data API.`,
      lastSuccessAt: new Date().toISOString(),
    });
    pushHealth(health, { id, status: records === 2 ? "healthy" : "degraded", records, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "U.S. Bureau of Labor Statistics", state: "errore", coverage: ["inflazione USA", "mercato del lavoro USA"], detail });
    pushHealth(health, { id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

async function collectTreasuryFiscal(snapshot, health) {
  const id = "us-treasury-fiscal";
  const started = Date.now();
  try {
    const url = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=1";
    const { data, latencyMs } = await requestJson(url);
    const row = Array.isArray(data?.data) ? data.data[0] : undefined;
    const totalDebt = finiteNumber(row?.tot_pub_debt_out_amt);
    const publicDebt = finiteNumber(row?.debt_held_public_amt);
    if (!row?.record_date || totalDebt === undefined) throw new Error("Treasury Fiscal Data payload not usable");

    upsertMacro(snapshot, {
      id: "US_TOTAL_PUBLIC_DEBT",
      label: "Debito pubblico USA totale",
      value: Number((totalDebt / 1_000_000_000_000).toFixed(3)),
      date: row.record_date,
      unit: "trilioni USD",
      source: "U.S. Treasury Fiscal Data",
    });
    if (publicDebt !== undefined) {
      upsertMacro(snapshot, {
        id: "US_DEBT_HELD_PUBLIC",
        label: "Debito USA detenuto dal pubblico",
        value: Number((publicDebt / 1_000_000_000_000).toFixed(3)),
        date: row.record_date,
        unit: "trilioni USD",
        source: "U.S. Treasury Fiscal Data",
      });
    }

    upsertProvider(snapshot, {
      id,
      name: "U.S. Treasury Fiscal Data",
      state: "operativo",
      coverage: ["debito federale USA", "debito detenuto dal pubblico", "rischio fiscale"],
      detail: `Debt to the Penny aggiornato al ${row.record_date}.`,
      lastSuccessAt: new Date().toISOString(),
    });
    pushHealth(health, { id, status: "healthy", records: publicDebt === undefined ? 1 : 2, latencyMs, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "U.S. Treasury Fiscal Data", state: "errore", coverage: ["debito federale USA", "rischio fiscale"], detail });
    pushHealth(health, { id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

async function collectCftc(snapshot, health) {
  const id = "cftc-cot";
  const started = Date.now();
  try {
    const url = "https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=25&$order=report_date_as_yyyy_mm_dd%20DESC";
    const { data, latencyMs } = await requestJson(url);
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) throw new Error("CFTC COT returned no rows");
    const latestDate = rows[0]?.report_date_as_yyyy_mm_dd || rows[0]?.report_date_as_yyyy_mm_dd_ || rows[0]?.report_date;
    const openInterest = rows.reduce((sum, row) => sum + (finiteNumber(row?.open_interest_all) ?? 0), 0);

    addDiscovery(snapshot, {
      id: `cftc-cot-${String(latestDate || "latest").slice(0, 10)}`,
      name: "CFTC Commitments of Traders",
      category: "POSITIONING",
      signal: `Campione COT acquisito: ${rows.length} contratti recenti${openInterest > 0 ? `, open interest campione ${Math.round(openInterest).toLocaleString("en-US")}` : ""}. Usare come contesto di posizionamento, non come segnale standalone.`,
      score: 60,
      risk: 45,
      date: latestDate,
      source: "CFTC Public Reporting Environment",
    });

    upsertProvider(snapshot, {
      id,
      name: "CFTC Commitments of Traders",
      state: "operativo",
      coverage: ["futures", "open interest", "posizionamento operatori"],
      detail: `${rows.length} righe COT recenti acquisite dal Public Reporting Environment.`,
      lastSuccessAt: new Date().toISOString(),
    });
    pushHealth(health, { id, status: "healthy", records: rows.length, latencyMs, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "CFTC Commitments of Traders", state: "errore", coverage: ["futures", "posizionamento"], detail });
    pushHealth(health, { id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

async function collectFinra(snapshot, health) {
  const id = "finra-trace";
  const started = Date.now();
  try {
    const url = "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryDailyAggregates?limit=5";
    const { data, latencyMs } = await requestJson(url);
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) throw new Error("FINRA fixed-income API returned no rows");
    const latest = rows[0]?.tradeDate || rows[0]?.reportDate || rows[0]?.date;

    upsertProvider(snapshot, {
      id,
      name: "FINRA Fixed Income / TRACE",
      state: "operativo",
      coverage: ["Treasury TRACE", "fixed income", "market breadth e volume"],
      detail: `${rows.length} record fixed-income recenti acquisiti${latest ? `; ultimo ${latest}` : ""}.`,
      lastSuccessAt: new Date().toISOString(),
    });
    pushHealth(health, { id, status: "healthy", records: rows.length, latencyMs, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "FINRA Fixed Income / TRACE", state: "errore", coverage: ["Treasury TRACE", "fixed income"], detail });
    pushHealth(health, { id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

export async function collectInstitutionalSignals(snapshot, health = []) {
  await Promise.allSettled([
    collectBls(snapshot, health),
    collectTreasuryFiscal(snapshot, health),
    collectCftc(snapshot, health),
    collectFinra(snapshot, health),
  ]);

  snapshot.providers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  snapshot.macro.sort((a, b) => String(a.label || a.id || "").localeCompare(String(b.label || b.id || "")));
  return { snapshot, health };
}
