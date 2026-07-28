"""Acquisizione modulare di dati finanziari e macroeconomici gratuiti.

Provider supportati:
- Yahoo Finance tramite yfinance, senza API key.
- FRED tramite fredapi, con API key.
- Alpha Vantage tramite REST, con API key opzionale.

Il modulo restituisce DataFrame Pandas e può salvare automaticamente i dati in CSV.
Le chiavi vengono lette da variabili d'ambiente o da un file .env locale.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv
from fredapi import Fred
from requests import Response, Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

load_dotenv()

LOGGER = logging.getLogger("fenice.financial_data")


class FinancialDataError(RuntimeError):
    """Errore base del modulo di acquisizione dati."""


class MissingApiKeyError(FinancialDataError):
    """Chiave API obbligatoria assente."""


class ProviderRateLimitError(FinancialDataError):
    """Il provider ha rifiutato la richiesta per limite di chiamate."""


class EmptyDataError(FinancialDataError):
    """Il provider non ha restituito dati utilizzabili."""


@dataclass(frozen=True)
class Settings:
    """Configurazione letta dall'ambiente."""

    fred_api_key: str | None
    alpha_vantage_api_key: str | None
    output_dir: Path
    http_timeout: int

    @classmethod
    def from_env(cls) -> "Settings":
        timeout_raw = os.getenv("FINANCIAL_DATA_HTTP_TIMEOUT", "30")
        try:
            timeout = max(5, int(timeout_raw))
        except ValueError:
            timeout = 30

        return cls(
            fred_api_key=os.getenv("FRED_API_KEY") or None,
            alpha_vantage_api_key=os.getenv("ALPHA_VANTAGE_API_KEY") or None,
            output_dir=Path(os.getenv("FINANCIAL_DATA_OUTPUT_DIR", "output")),
            http_timeout=timeout,
        )


def _safe_filename(value: str) -> str:
    """Converte simboli e codici serie in nomi file sicuri."""

    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return cleaned or "data"


def _save_csv(data: pd.DataFrame, output_path: Path) -> Path:
    """Salva un DataFrame in CSV creando la cartella quando necessario."""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(output_path, index=True, encoding="utf-8")
    LOGGER.info("CSV salvato in %s", output_path.resolve())
    return output_path


def download_market_history(
    symbol: str,
    *,
    start: str | None = None,
    end: str | None = None,
    period: str = "5y",
    interval: str = "1d",
    auto_adjust: bool = True,
    save_csv: bool = True,
    output_dir: str | Path | None = None,
) -> pd.DataFrame:
    """Scarica lo storico di un'azione, ETF, indice, valuta o materia prima.

    Esempi simboli Yahoo Finance:
    - AAPL
    - ^FTMIB per FTSE MIB
    - EURUSD=X
    - GC=F per future oro

    Quando ``start`` o ``end`` sono valorizzati, ``period`` viene ignorato.
    """

    normalized_symbol = symbol.strip()
    if not normalized_symbol:
        raise ValueError("Il simbolo Yahoo Finance non può essere vuoto.")

    try:
        kwargs: dict[str, Any] = {
            "tickers": normalized_symbol,
            "interval": interval,
            "auto_adjust": auto_adjust,
            "progress": False,
            "threads": False,
            "timeout": 30,
            "multi_level_index": False,
        }
        if start or end:
            kwargs.update(start=start, end=end)
        else:
            kwargs["period"] = period

        data = yf.download(**kwargs)
    except Exception as exc:  # yfinance espone eccezioni diverse tra versioni
        raise FinancialDataError(
            f"Errore Yahoo Finance durante il download di {normalized_symbol}: {exc}"
        ) from exc

    if data is None or data.empty:
        raise EmptyDataError(
            f"Yahoo Finance non ha restituito dati per {normalized_symbol}. "
            "Controllare il simbolo, l'intervallo e le date richieste."
        )

    data = data.copy()
    data.index.name = "Date"
    data = data.dropna(how="all")

    if save_csv:
        destination = Path(output_dir) if output_dir else Settings.from_env().output_dir
        filename = f"yahoo_{_safe_filename(normalized_symbol)}_{interval}.csv"
        _save_csv(data, destination / filename)

    return data


def get_fred_series(
    series_id: str,
    *,
    start: str | None = None,
    end: str | None = None,
    save_csv: bool = True,
    output_dir: str | Path | None = None,
    api_key: str | None = None,
) -> pd.DataFrame:
    """Recupera una serie FRED e la restituisce come DataFrame.

    Alcuni codici utili:
    - FEDFUNDS: Federal Funds Effective Rate USA
    - CPIAUCSL: indice dei prezzi al consumo USA
    - CP0000EZ19M086NEST: inflazione area euro, indice armonizzato
    - M2SL: offerta monetaria M2 USA
    - ECBDFR: tasso sui depositi BCE
    """

    normalized_series = series_id.strip().upper()
    if not normalized_series:
        raise ValueError("Il codice serie FRED non può essere vuoto.")

    selected_key = api_key or Settings.from_env().fred_api_key
    if not selected_key:
        raise MissingApiKeyError(
            "FRED_API_KEY non configurata. Copiare .env.example in .env e inserire la chiave gratuita."
        )

    try:
        fred = Fred(api_key=selected_key)
        series = fred.get_series(
            normalized_series,
            observation_start=start,
            observation_end=end,
        )
    except Exception as exc:
        message = str(exc).lower()
        if "429" in message or "rate limit" in message or "too many" in message:
            raise ProviderRateLimitError("Limite di chiamate FRED raggiunto.") from exc
        raise FinancialDataError(
            f"Errore FRED durante il recupero di {normalized_series}: {exc}"
        ) from exc

    if series is None or series.empty:
        raise EmptyDataError(f"FRED non ha restituito dati per {normalized_series}.")

    data = series.rename(normalized_series).to_frame()
    data.index.name = "Date"
    data = data.dropna(how="all")

    if save_csv:
        destination = Path(output_dir) if output_dir else Settings.from_env().output_dir
        filename = f"fred_{_safe_filename(normalized_series)}.csv"
        _save_csv(data, destination / filename)

    return data


@retry(
    retry=retry_if_exception_type((requests.Timeout, requests.ConnectionError)),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    stop=stop_after_attempt(3),
    reraise=True,
)
def _request_json(
    session: Session,
    url: str,
    *,
    params: dict[str, str],
    timeout: int,
) -> dict[str, Any]:
    """Esegue una richiesta REST con retry sulle anomalie di rete."""

    response: Response = session.get(url, params=params, timeout=timeout)
    if response.status_code == 429:
        raise ProviderRateLimitError("Limite di chiamate Alpha Vantage raggiunto.")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise FinancialDataError("Risposta Alpha Vantage non valida.")
    return payload


def get_alpha_vantage_fx_daily(
    from_symbol: str,
    to_symbol: str,
    *,
    output_size: str = "compact",
    save_csv: bool = True,
    output_dir: str | Path | None = None,
    api_key: str | None = None,
    session: Session | None = None,
) -> pd.DataFrame:
    """Recupera lo storico Forex giornaliero da Alpha Vantage."""

    base = from_symbol.strip().upper()
    quote = to_symbol.strip().upper()
    if len(base) != 3 or len(quote) != 3:
        raise ValueError("Le valute devono essere codici ISO di 3 lettere, ad esempio EUR e USD.")
    if output_size not in {"compact", "full"}:
        raise ValueError("output_size deve essere 'compact' oppure 'full'.")

    settings = Settings.from_env()
    selected_key = api_key or settings.alpha_vantage_api_key
    if not selected_key:
        raise MissingApiKeyError(
            "ALPHA_VANTAGE_API_KEY non configurata. Copiare .env.example in .env e inserire la chiave gratuita."
        )

    active_session = session or requests.Session()
    try:
        payload = _request_json(
            active_session,
            "https://www.alphavantage.co/query",
            params={
                "function": "FX_DAILY",
                "from_symbol": base,
                "to_symbol": quote,
                "outputsize": output_size,
                "apikey": selected_key,
            },
            timeout=settings.http_timeout,
        )
    except ProviderRateLimitError:
        raise
    except requests.RequestException as exc:
        raise FinancialDataError(f"Errore HTTP Alpha Vantage: {exc}") from exc
    finally:
        if session is None:
            active_session.close()

    provider_message = payload.get("Note") or payload.get("Information")
    if provider_message:
        raise ProviderRateLimitError(str(provider_message))
    if payload.get("Error Message"):
        raise FinancialDataError(str(payload["Error Message"]))

    time_series = payload.get("Time Series FX (Daily)")
    if not isinstance(time_series, dict) or not time_series:
        raise EmptyDataError(f"Alpha Vantage non ha restituito dati per {base}/{quote}.")

    data = pd.DataFrame.from_dict(time_series, orient="index")
    data.index = pd.to_datetime(data.index)
    data.index.name = "Date"
    data = data.rename(
        columns={
            "1. open": "Open",
            "2. high": "High",
            "3. low": "Low",
            "4. close": "Close",
        }
    )
    data = data.apply(pd.to_numeric, errors="coerce").sort_index()

    if save_csv:
        destination = Path(output_dir) if output_dir else settings.output_dir
        filename = f"alpha_vantage_fx_{base}_{quote}.csv"
        _save_csv(data, destination / filename)

    return data


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scarica dati finanziari per Fenice Investment System."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    yahoo = subparsers.add_parser("yahoo", help="Scarica dati da Yahoo Finance")
    yahoo.add_argument("symbol", help="Simbolo, ad esempio AAPL oppure ^FTMIB")
    yahoo.add_argument("--start", help="Data iniziale YYYY-MM-DD")
    yahoo.add_argument("--end", help="Data finale YYYY-MM-DD")
    yahoo.add_argument("--period", default="5y", help="Periodo yfinance, predefinito 5y")
    yahoo.add_argument("--interval", default="1d", help="Intervallo yfinance, predefinito 1d")

    fred = subparsers.add_parser("fred", help="Scarica una serie macroeconomica FRED")
    fred.add_argument("series_id", help="Codice serie, ad esempio FEDFUNDS")
    fred.add_argument("--start", help="Data iniziale YYYY-MM-DD")
    fred.add_argument("--end", help="Data finale YYYY-MM-DD")

    fx = subparsers.add_parser("fx", help="Scarica Forex giornaliero da Alpha Vantage")
    fx.add_argument("from_symbol", help="Valuta base, ad esempio EUR")
    fx.add_argument("to_symbol", help="Valuta quotata, ad esempio USD")
    fx.add_argument("--output-size", choices=["compact", "full"], default="compact")

    return parser


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )
    args = _build_parser().parse_args()

    try:
        if args.command == "yahoo":
            data = download_market_history(
                args.symbol,
                start=args.start,
                end=args.end,
                period=args.period,
                interval=args.interval,
            )
        elif args.command == "fred":
            data = get_fred_series(
                args.series_id,
                start=args.start,
                end=args.end,
            )
        else:
            data = get_alpha_vantage_fx_daily(
                args.from_symbol,
                args.to_symbol,
                output_size=args.output_size,
            )

        print(data.tail())
        return 0
    except FinancialDataError as exc:
        LOGGER.error("%s", exc)
        return 1
    except (ValueError, KeyError) as exc:
        LOGGER.error("Parametri non validi: %s", exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
