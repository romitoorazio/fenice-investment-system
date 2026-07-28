"""Costruisce uno snapshot JSON compatibile con il Global Data Hub di Fenice.

Lo script usa il modulo ``financial_data.py`` e normalizza dati di mercato e
macroeconomici in un contratto stabile. Non esegue operazioni di trading.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
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
    {"symbol": "^GSPC", "name": "S&P 500", "assetClass": "Indici", "market": "USA"},
    {"symbol": "^FTMIB", "name": "FTSE MIB", "assetClass": "Indici", "market": "Italia"},
    {"symbol": "EURUSD=X", "name": "EUR/USD", "assetClass": "Forex", "market": "Globale"},
    {"symbol": "GC=F", "name": "Oro", "assetClass": "Materie prime", "market": "Globale"},
    {"symbol": "BTC-USD", "name": "Bitcoin", "assetClass": "Criptovalute", "market": "Globale"},
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


def latest_valid_row(data: pd.DataFrame) -> tuple[pd.Timestamp, pd.Series]:
    cleaned = data.dropna(how="all")
    if cleaned.empty:
        raise EmptyDataError("Il DataFrame non contiene righe utilizzabili.")
    return cleaned.index[-1], cleaned.iloc[-1]


def score_market(change_percent: float | None) -> tuple[int, int]:
    """Restituisce score opportunità e rischio conservativi da 0 a 100.

    È solo una normalizzazione tecnica iniziale: non rappresenta un consiglio
    finanziario e sarà sostituita dal Discovery Engine multi-fattore.
    """

    if change_percent is None:
        return 50, 60
    opportunity = round(max(0, min(100, 50 + change_percent * 4)))
    risk = round(max(10, min(100, 45 + abs(change_percent) * 5)))
    return opportunity, risk


def build_market_reading(definition: dict[str, str]) -> dict[str, Any]:
    symbol = definition["symbol"]
    data = download_market_history(symbol, period="5d", interval="1d", save_csv=False)
    timestamp, row = latest_valid_row(data)

    close = finite_number(row.get("Close"))
    open_value = finite_number(row.get("Open"))
    change_percent = None
    if close is not None and open_value not in (None, 0):
        change_percent = ((close - open_value) / open_value) * 100

    score, risk = score_market(change_percent)
    observed_at = pd.Timestamp(timestamp).to_pydatetime().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "symbol": symbol,
        "name": definition.get("name", symbol),
        "assetClass": definition.get("assetClass", "Non classificato"),
        "market": definition.get("market"),
        "price": close,
        "currency": definition.get("currency"),
        "changePercent": round(change_percent, 4) if change_percent is not None else None,
        "score": score,
        "risk": risk,
        "source": "Yahoo Finance",
        "observedAt": observed_at,
        "classification": "market-observation",
    }


def build_macro_reading(definition: dict[str, str]) -> dict[str, Any]:
    series_id = definition["seriesId"]
    data = get_fred_series(series_id, save_csv=False)
    timestamp, row = latest_valid_row(data)
    value = finite_number(row.iloc[0])

    return {
        "id": series_id,
        "label": definition.get("label", series_id),
        "value": value,
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


def build_snapshot(
    market_definitions: Iterable[dict[str, str]],
    macro_definitions: Iterable[dict[str, str]],
) -> dict[str, Any]:
    generated_at = utc_now()
    warnings: list[str] = []
    markets: list[dict[str, Any]] = []
    macro: list[dict[str, Any]] = []

    yahoo_success = False
    for definition in market_definitions:
        try:
            markets.append(build_market_reading(definition))
            yahoo_success = True
        except (FinancialDataError, ValueError, KeyError) as exc:
            warnings.append(f"Yahoo {definition.get('symbol', '?')}: {exc}")

    fred_success = False
    fred_configured = True
    for definition in macro_definitions:
        try:
            macro.append(build_macro_reading(definition))
            fred_success = True
        except MissingApiKeyError as exc:
            fred_configured = False
            warnings.append(str(exc))
            break
        except (FinancialDataError, ValueError, KeyError) as exc:
            warnings.append(f"FRED {definition.get('seriesId', '?')}: {exc}")

    providers = [
        ProviderStatus(
            id="yahoo-finance",
            name="Yahoo Finance",
            state="operativo" if yahoo_success else "errore",
            coverage=["azioni", "indici", "ETF", "forex", "materie prime", "crypto"],
            detail=f"{len(markets)} strumenti acquisiti.",
            lastSuccessAt=generated_at if yahoo_success else None,
        ),
        ProviderStatus(
            id="fred",
            name="FRED",
            state="operativo" if fred_success else ("non configurato" if not fred_configured else "errore"),
            coverage=["tassi", "inflazione", "moneta", "macroeconomia"],
            detail=f"{len(macro)} serie acquisite." if fred_success else "API key assente o feed non disponibile.",
            lastSuccessAt=generated_at if fred_success else None,
        ),
    ]

    mode = "live" if yahoo_success and fred_success else "partial" if markets or macro else "bootstrap"

    return {
        "version": 1,
        "generatedAt": generated_at,
        "mode": mode,
        "headline": "Snapshot globale aggiornato automaticamente dai provider gratuiti.",
        "pulse": {
            "verdict": "ATTENDERE",
            "opportunity": 0,
            "risk": 0,
            "confidence": 0,
            "marketMomentum": 0,
            "macroHealth": 0,
            "discoveryHeat": 0,
        },
        "providers": [asdict(provider) for provider in providers],
        "markets": markets,
        "macro": macro,
        "discoveries": [],
        "warnings": list(dict.fromkeys(warnings)),
        "executionPolicy": {
            "autonomousAnalysis": True,
            "autonomousTrading": False,
            "humanConfirmationRequired": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera uno snapshot JSON per Fenice Investment System.")
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
