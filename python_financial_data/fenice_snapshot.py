"""Genera lo snapshot operativo del Global Data Hub di Fenice.

Il modulo raccoglie dati gratuiti, calcola indicatori tecnici trasparenti e
produce candidati da approfondire. Non invia ordini e non garantisce rendimenti.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

import pandas as pd

from financial_data import (
    EmptyDataError,
    FinancialDataError,
    MissingApiKeyError,
    download_market_history,
    get_fred_series,
)

LOGGER = logging.getLogger("fenice.snapshot")

DEFAULT_MARKETS = [
    {"symbol": "AAPL", "name": "Apple", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "MSFT", "name": "Microsoft", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "NVDA", "name": "NVIDIA", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "GOOGL", "name": "Alphabet", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "AMZN", "name": "Amazon", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "META", "name": "Meta", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "TSLA", "name": "Tesla", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "LLY", "name": "Eli Lilly", "assetClass": "Azioni", "market": "USA"},
    {"symbol": "NVO", "name": "Novo Nordisk", "assetClass": "Azioni", "market": "Europa"},
    {"symbol": "ENI.MI", "name": "Eni", "assetClass": "Azioni", "market": "Italia"},
    {"symbol": "ISP.MI", "name": "Intesa Sanpaolo", "assetClass": "Azioni", "market": "Italia"},
    {"symbol": "^GSPC", "name": "S&P 500", "assetClass": "Indici", "market": "USA"},
    {"symbol": "^IXIC", "name": "Nasdaq Composite", "assetClass": "Indici", "market": "USA"},
    {"symbol": "^STOXX50E", "name": "Euro Stoxx 50", "assetClass": "Indici", "market": "Europa"},
    {"symbol": "FTSEMIB.MI", "name": "FTSE MIB", "assetClass": "Indici", "market": "Italia"},
    {"symbol": "EEM", "name": "Mercati emergenti", "assetClass": "ETF", "market": "Globale"},
    {"symbol": "TLT", "name": "Treasury USA lunga scadenza", "assetClass": "Obbligazioni", "market": "USA"},
    {"symbol": "EURUSD=X", "name": "EUR/USD", "assetClass": "Forex", "market": "Globale"},
    {"symbol": "GC=F", "name": "Oro", "assetClass": "Materie prime", "market": "Globale"},
    {"symbol": "CL=F", "name": "Petrolio WTI", "assetClass": "Materie prime", "market": "Globale"},
    {"symbol": "BTC-USD", "name": "Bitcoin", "assetClass": "Criptovalute", "market": "Globale"},
    {"symbol": "ETH-USD", "name": "Ethereum", "assetClass": "Criptovalute", "market": "Globale"},
]

DEFAULT_MACRO = [
    {"seriesId": "FEDFUNDS", "label": "Federal Funds Rate", "unit": "%"},
    {"seriesId": "CPIAUCSL", "label": "Indice prezzi al consumo USA", "unit": "indice"},
    {"seriesId": "M2SL", "label": "Offerta monetaria M2 USA", "unit": "miliardi USD"},
    {"seriesId": "ECBDFR", "label": "Tasso depositi BCE", "unit": "%"},
]


@dataclass(frozen=True)
class ProviderStatus:
    id: str
    name: str
    state: str
    coverage: list[str]
    detail: str
    lastSuccessAt: str | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return max(minimum, min(maximum, value))


def percentage_return(series: pd.Series, periods: int) -> float | None:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if len(clean) <= periods or clean.iloc[-periods - 1] == 0:
        return None
    return float((clean.iloc[-1] / clean.iloc[-periods - 1] - 1) * 100)


def calculate_metrics(data: pd.DataFrame) -> dict[str, float | None]:
    close = pd.to_numeric(data.get("Close"), errors="coerce").dropna()
    if close.empty:
        raise EmptyDataError("Serie prezzi priva di chiusure utilizzabili.")

    daily_returns = close.pct_change().dropna()
    volatility = None
    if len(daily_returns) >= 20:
        volatility = float(daily_returns.tail(20).std() * math.sqrt(252) * 100)

    rolling_peak = close.cummax()
    drawdown = ((close / rolling_peak) - 1) * 100
    max_drawdown = float(drawdown.tail(60).min()) if not drawdown.empty else None

    sma20 = float(close.tail(20).mean()) if len(close) >= 20 else None
    sma50 = float(close.tail(50).mean()) if len(close) >= 50 else None
    price = float(close.iloc[-1])

    return {
        "price": price,
        "return1d": percentage_return(close, 1),
        "return5d": percentage_return(close, 5),
        "return20d": percentage_return(close, 20),
        "volatility20d": volatility,
        "maxDrawdown60d": max_drawdown,
        "distanceSma20": ((price / sma20) - 1) * 100 if sma20 else None,
        "distanceSma50": ((price / sma50) - 1) * 100 if sma50 else None,
    }


def score_market(metrics: dict[str, float | None]) -> tuple[int, int, str]:
    r5 = metrics["return5d"] or 0
    r20 = metrics["return20d"] or 0
    d20 = metrics["distanceSma20"] or 0
    d50 = metrics["distanceSma50"] or 0
    volatility = metrics["volatility20d"] if metrics["volatility20d"] is not None else 45
    drawdown = abs(metrics["maxDrawdown60d"] or 0)

    momentum = clamp(50 + r5 * 1.5 + r20 * 0.8)
    trend = clamp(50 + d20 * 1.5 + d50)
    risk = clamp(20 + volatility * 0.75 + drawdown * 1.2, 10, 100)
    opportunity = clamp(momentum * 0.45 + trend * 0.35 + (100 - risk) * 0.20)

    if opportunity >= 70 and risk <= 65:
        classification = "candidato-prioritario"
    elif opportunity >= 58:
        classification = "da-monitorare"
    else:
        classification = "osservazione"

    return round(opportunity), round(risk), classification


def build_market_reading(definition: dict[str, str]) -> dict[str, Any]:
    symbol = definition["symbol"]
    data = download_market_history(symbol, period="6mo", interval="1d", save_csv=False)
    metrics = calculate_metrics(data)
    score, risk, classification = score_market(metrics)
    timestamp = pd.Timestamp(data.dropna(how="all").index[-1])
    observed_at = timestamp.to_pydatetime().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "symbol": symbol,
        "name": definition.get("name", symbol),
        "assetClass": definition.get("assetClass", "Non classificato"),
        "market": definition.get("market"),
        "price": metrics["price"],
        "currency": definition.get("currency"),
        "changePercent": round(metrics["return1d"], 4) if metrics["return1d"] is not None else None,
        "score": score,
        "risk": risk,
        "source": "Yahoo Finance",
        "observedAt": observed_at,
        "classification": classification,
        "metrics": {key: round(value, 4) if value is not None else None for key, value in metrics.items()},
    }


def build_macro_reading(definition: dict[str, str]) -> dict[str, Any]:
    series_id = definition["seriesId"]
    data = get_fred_series(series_id, save_csv=False)
    cleaned = data.dropna(how="all")
    if cleaned.empty:
        raise EmptyDataError(f"FRED non ha restituito dati per {series_id}.")
    timestamp, row = cleaned.index[-1], cleaned.iloc[-1]
    return {
        "id": series_id,
        "label": definition.get("label", series_id),
        "value": finite_number(row.iloc[0]),
        "date": pd.Timestamp(timestamp).date().isoformat(),
        "unit": definition.get("unit", ""),
        "source": "FRED",
    }


def load_config(path: Path | None) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    if path is None:
        return DEFAULT_MARKETS, DEFAULT_MACRO
    payload = json.loads(path.read_text(encoding="utf-8"))
    markets = payload.get("markets", DEFAULT_MARKETS)
    macro = payload.get("macro", DEFAULT_MACRO)
    if not isinstance(markets, list) or not isinstance(macro, list):
        raise ValueError("La configurazione deve contenere liste 'markets' e 'macro'.")
    return markets, macro


def provider_state(successes: int, requested: int, configured: bool = True) -> str:
    if not configured:
        return "non configurato"
    if successes == 0:
        return "errore"
    if successes < requested:
        return "parziale"
    return "operativo"


def calculate_pulse(markets: list[dict[str, Any]], macro: list[dict[str, Any]], provider_count: int) -> dict[str, Any]:
    if not markets:
        return {
            "verdict": "ATTENDERE",
            "opportunity": 0,
            "risk": 100,
            "confidence": 0,
            "marketMomentum": 0,
            "macroHealth": 0,
            "discoveryHeat": 0,
        }

    opportunities = [int(item["score"]) for item in markets]
    risks = [int(item["risk"]) for item in markets]
    positive = [item for item in markets if (item.get("metrics", {}).get("return20d") or 0) > 0]
    candidates = [item for item in markets if item["score"] >= 65 and item["risk"] <= 70]

    opportunity = round(mean(opportunities))
    risk = round(mean(risks))
    momentum = round(len(positive) / len(markets) * 100)
    confidence = round(clamp(35 + min(len(markets), 40) * 1.2 + min(provider_count, 4) * 8 + (10 if macro else 0)))
    discovery_heat = round(len(candidates) / len(markets) * 100)
    macro_health = 50 if not macro else round(clamp(50 + len(macro) * 5))

    if confidence < 55 or risk >= 75:
        verdict = "PROTEGGERE CAPITALE"
    elif opportunity >= 62 and discovery_heat >= 10:
        verdict = "VALUTARE"
    else:
        verdict = "ATTENDERE"

    return {
        "verdict": verdict,
        "opportunity": opportunity,
        "risk": risk,
        "confidence": confidence,
        "marketMomentum": momentum,
        "macroHealth": macro_health,
        "discoveryHeat": discovery_heat,
    }


def build_discoveries(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(markets, key=lambda item: (item["score"] - item["risk"] * 0.35), reverse=True)
    discoveries = []
    for item in ranked:
        if item["score"] < 58:
            continue
        discoveries.append(
            {
                "id": f"market-{item['symbol']}",
                "name": item["name"],
                "category": "CRYPTO" if item["assetClass"] == "Criptovalute" else "NEWS",
                "signal": f"Score {item['score']}/100, rischio {item['risk']}/100. Verificare fondamentali, valutazione e notizie prima di decidere.",
                "score": item["score"],
                "risk": item["risk"],
                "date": item["observedAt"],
                "source": item["source"],
            }
        )
        if len(discoveries) >= 10:
            break
    return discoveries


def build_snapshot(
    market_definitions: Iterable[dict[str, str]],
    macro_definitions: Iterable[dict[str, str]],
) -> dict[str, Any]:
    generated_at = utc_now()
    warnings: list[str] = []
    markets: list[dict[str, Any]] = []
    macro: list[dict[str, Any]] = []
    market_defs = list(market_definitions)
    macro_defs = list(macro_definitions)

    for definition in market_defs:
        try:
            markets.append(build_market_reading(definition))
        except (FinancialDataError, ValueError, KeyError) as exc:
            warnings.append(f"Yahoo {definition.get('symbol', '?')}: {exc}")

    fred_configured = True
    for definition in macro_defs:
        try:
            macro.append(build_macro_reading(definition))
        except MissingApiKeyError:
            fred_configured = False
            break
        except (FinancialDataError, ValueError, KeyError) as exc:
            warnings.append(f"FRED {definition.get('seriesId', '?')}: {exc}")

    yahoo_state = provider_state(len(markets), len(market_defs))
    fred_state = provider_state(len(macro), len(macro_defs), fred_configured)
    providers = [
        ProviderStatus(
            id="yahoo-finance",
            name="Yahoo Finance",
            state=yahoo_state,
            coverage=["azioni", "indici", "ETF", "obbligazioni", "forex", "materie prime", "crypto"],
            detail=f"{len(markets)} strumenti acquisiti su {len(market_defs)} richiesti.",
            lastSuccessAt=generated_at if markets else None,
        ),
        ProviderStatus(
            id="fred",
            name="FRED",
            state=fred_state,
            coverage=["tassi", "inflazione", "moneta", "macroeconomia"],
            detail=(
                f"{len(macro)} serie acquisite su {len(macro_defs)} richieste."
                if fred_configured
                else "Chiave API non configurata: provider escluso senza classificarlo come errore tecnico."
            ),
            lastSuccessAt=generated_at if macro else None,
        ),
    ]

    active_provider_count = sum(provider.state in {"operativo", "parziale"} for provider in providers)
    mode = "live" if all(provider.state == "operativo" for provider in providers) else "partial" if markets or macro else "bootstrap"
    pulse = calculate_pulse(markets, macro, active_provider_count)
    discoveries = build_discoveries(markets)

    return {
        "version": 2,
        "generatedAt": generated_at,
        "mode": mode,
        "headline": "Fenice analizza mercati globali, classifica opportunità e protegge il capitale con controlli di qualità.",
        "investmentMandate": {
            "startingCapital": 10000,
            "targetCapital": 100000,
            "currency": "EUR",
            "horizonYears": 10,
            "targetType": "obiettivo ambizioso non garantito",
            "capitalPreservationFirst": True,
        },
        "pulse": pulse,
        "providers": [asdict(provider) for provider in providers],
        "markets": markets,
        "macro": macro,
        "discoveries": discoveries,
        "warnings": list(dict.fromkeys(warnings)),
        "dataQuality": pulse["confidence"],
        "executionPolicy": {
            "autonomousAnalysis": True,
            "autonomousTrading": False,
            "humanConfirmationRequired": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera lo snapshot JSON per Fenice Investment System.")
    parser.add_argument("--config", type=Path, help="File JSON opzionale con mercati e serie macro.")
    parser.add_argument("--output", type=Path, default=Path("output/fenice-snapshot.json"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    try:
        market_definitions, macro_definitions = load_config(args.config)
        snapshot = build_snapshot(market_definitions, macro_definitions)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        LOGGER.info("Snapshot salvato in %s", args.output.resolve())
        print(json.dumps({"output": str(args.output), "mode": snapshot["mode"], "warnings": len(snapshot["warnings"])}))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        LOGGER.error("Impossibile generare lo snapshot: %s", exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
