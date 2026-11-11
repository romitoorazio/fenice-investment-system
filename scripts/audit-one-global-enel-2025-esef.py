#!/usr/bin/env python3
"""ONE GLOBAL: bounded read-only audit of issuer-origin ENEL FY2025 iXBRL ESEF ZIP.

NO portfolio changes, BUY/DCF elevation, paid providers, PAPER fills or Directa.
A ZIP parsed from the official publisher is source-backed research, NOT a
verified consolidated IFRS valuation: cross-document perimeter and annual
statement-note reconciliation still require separate independent checks.
Only one pinned issuer URL is downloaded; local ZIP tests are never certified.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ISSUER = "ENEL"
KEY = "XMIL:ENEL"
LEI = "WOCMU6HCI0OJWNPRZS33"
YEAR_START = "2025-01-01"
YEAR_END = "2025-12-31"
SOURCE_URL = ("https://www.enel.com/content/dam/enel-com/documenti/"
              "investitori/informazioni-finanziarie/2025/annuali/it/"
              "relazione-finanziaria-annuale-consolidata-2025-ixbrl.zip")
MAX_ZIP = 96 * 1024 * 1024
MAX_UNCOMPRESSED = 240 * 1024 * 1024
MAX_XHTML = 72 * 1024 * 1024
MAX_FILES = 5000
MAX_RATIO = 1000
IX = "{http://www.xbrl.org/2013/inlineXBRL}"
XBRLI = "{http://www.xbrl.org/2003/instance}"
METRICS = {
    "revenue": {"Revenue", "RevenueFromContractsWithCustomers"},
    "netIncomeTotal": {"ProfitLoss"},
    "operatingCashFlow": {"CashFlowsFromUsedInOperatingActivities"},
    "assets": {"Assets"},
    "liabilities": {"Liabilities"},
    "equity": {"Equity"},
}
INSTANT = {"assets", "liabilities", "equity"}
RE_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$")
RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def final_report(status, **more):
    return {
        "mode": "ONE_GLOBAL_ENEL_2025_OFFICIAL_IXBRL_RESEARCH_ONLY",
        "issuer": ISSUER, "key": KEY, "lei": LEI,
        "fiscalYearStart": YEAR_START, "fiscalYearEnd": YEAR_END,
        "sourceUrl": SOURCE_URL, "state": status, **more,
        "issuerFundamentalScoreEligible": False,
        "committeeDecisionsModified": False,
        "dcfEligible": False,
        "independentFinancialStatementAuditComplete": False,
        "consolidatedReportingPerimeterIndependentlyVerified": False,
        "approvedForStrategicPaper": False,
        "paperOrders": 0,
        "phase9Credit": 0,
        "brokerConnectivityAllowed": False,
        "liveTradingAllowed": False,
    }


def official_bytes(timeout=25):
    req = urllib.request.Request(SOURCE_URL, headers={
        "User-Agent": "FeniceInvestmentSystem/1.0 (research-only; official issuer ESEF)",
        "Accept": "application/zip, application/octet-stream",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        # No silent redirect to a third-party server or a different document.
        if response.geturl() != SOURCE_URL:
            raise ValueError("OFFICIAL_ESEF_REDIRECT_OR_SOURCE_MISMATCH")
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > MAX_ZIP:
            raise ValueError("OFFICIAL_ESEF_ZIP_EXCEEDS_MAX_BYTES")
        data = response.read(MAX_ZIP + 1)
    if len(data) > MAX_ZIP:
        raise ValueError("OFFICIAL_ESEF_ZIP_EXCEEDS_MAX_BYTES")
    return data


def collect_namespaces(data):
    namespaces = {}
    for event, pair in ET.iterparse(BytesIO(data), events=("start-ns",)):
        prefix, uri = pair
        if prefix in namespaces and namespaces[prefix] != uri:
            # Namespace reassignment may change the meaning of fact names.
            raise ValueError("ESEF_NAMESPACE_PREFIX_REASSIGNED")
        namespaces[prefix] = uri
    return namespaces


def xml_child(parent, name):
    return parent.find(XBRLI + name) if parent is not None else None


def text_of(elem):
    return "".join(elem.itertext()).strip() if elem is not None else ""


def xbrl_contexts(root):
    contexts, units = {}, {}
    for context in root.iter(XBRLI + "context"):
        key = context.attrib.get("id")
        if not key or key in contexts:
            raise ValueError("ESEF_DUPLICATE_OR_MISSING_CONTEXT_ID")
        entity = xml_child(context, "entity")
        identifier = xml_child(entity, "identifier")
        period = xml_child(context, "period")
        scheme = identifier.attrib.get("scheme", "") if identifier is not None else ""
        segment = xml_child(entity, "segment")
        scenario = xml_child(context, "scenario")
        contexts[key] = {
            "lei": text_of(identifier),
            "validLEIScheme": scheme.rstrip("/").endswith("/iso/17442"),
            "dimensional": segment is not None or scenario is not None,
            "start": text_of(xml_child(period, "startDate")),
            "end": text_of(xml_child(period, "endDate")),
            "instant": text_of(xml_child(period, "instant")),
        }
    for unit in root.iter(XBRLI + "unit"):
        key = unit.attrib.get("id")
        if not key or key in units:
            raise ValueError("ESEF_DUPLICATE_OR_MISSING_UNIT_ID")
        measures = list(unit.iter(XBRLI + "measure"))
        units[key] = [text_of(x) for x in measures]
    return contexts, units


def decimal_fact(elem, namespaces):
    if elem.attrib.get("{http://www.w3.org/2001/XMLSchema-instance}nil") == "true":
        return None
    if elem.attrib.get("continuedAt"):
        return None  # Continuations cannot be silently ignored.
    fmt = elem.attrib.get("format")
    printed = text_of(elem).replace("\u00a0", " ").replace("\u202f", " ").strip()
    if not printed or printed in {"-", "–", "—"}:
        return None
    if fmt:
        prefix, sep, transform = fmt.partition(":")
        ns = namespaces.get(prefix, "")
        if not sep or "xbrl.org/inlineXBRL/transformation/" not in ns:
            return None
        if transform.lower() in {"numcommadecimal", "numspacecomma"}:
            printed = printed.replace(".", "").replace(" ", "").replace(",", ".")
        elif transform.lower() == "numdotdecimal":
            printed = printed.replace(",", "").replace(" ", "")
        else:
            return None
    else:
        printed = printed.replace(" ", "")
    if not RE_NUMBER.fullmatch(printed):
        return None
    scale = elem.attrib.get("scale", "0")
    if not re.fullmatch(r"-?\d{1,2}", scale) or not -12 <= int(scale) <= 12:
        return None
    sign = elem.attrib.get("sign", "")
    if sign not in {"", "-"} or (sign == "-" and printed.startswith("-")):
        return None
    try:
        value = Decimal(printed) * Decimal(10) ** int(scale)
        if sign == "-":
            value = -value
        if not value.is_finite() or abs(value) > Decimal("1e15"):
            return None
        return value
    except InvalidOperation:
        return None


def annual_context(context, metric):
    if context["lei"] != LEI or not context["validLEIScheme"] or context["dimensional"]:
        return False
    if metric in INSTANT:
        return context["instant"] == YEAR_END
    return context["start"] == YEAR_START and context["end"] == YEAR_END


def audit_zip_bytes(data, *, source_is_official=False):
    if not isinstance(data, bytes) or not data or len(data) > MAX_ZIP:
        raise ValueError("ESEF_ZIP_SIZE_INVALID")
    digest = hashlib.sha256(data).hexdigest()
    accepted = defaultdict(list)
    count = Counter()
    xhtml_files = []
    with zipfile.ZipFile(BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) > MAX_FILES:
            raise ValueError("ESEF_ZIP_TOO_MANY_ENTRIES")
        total = 0
        for member in members:
            name = member.filename
            path = PurePosixPath(name)
            if (name.startswith("/") or "\\" in name or ".." in path.parts
                    or not name or (member.external_attr >> 16) & stat.S_IFMT(
                        member.external_attr >> 16) == stat.S_IFLNK):
                raise ValueError("ESEF_ZIP_UNSAFE_MEMBER")
            if member.flag_bits & 1:
                raise ValueError("ESEF_ZIP_ENCRYPTED_MEMBER")
            if member.is_dir():
                continue
            total += member.file_size
            if total > MAX_UNCOMPRESSED:
                raise ValueError("ESEF_ZIP_UNCOMPRESSED_LIMIT")
            if member.file_size > MAX_XHTML and path.suffix.lower() in {".xhtml", ".html", ".htm"}:
                raise ValueError("ESEF_XHTML_TOO_LARGE")
            if member.file_size > MAX_RATIO * max(1, member.compress_size):
                raise ValueError("ESEF_ZIP_COMPRESSION_RATIO_UNSAFE")
            if path.suffix.lower() in {".xhtml", ".html", ".htm"}:
                xhtml_files.append(member)
        if not xhtml_files:
            raise ValueError("ESEF_ZIP_NO_IXBRL_XHTML")
        if len(xhtml_files) > 20:
            raise ValueError("ESEF_ZIP_EXCESS_XHTML_REPORTS")
        for member in xhtml_files:
            raw = archive.read(member)
            namespaces = collect_namespaces(raw)
            root = ET.fromstring(raw)
            contexts, units = xbrl_contexts(root)
            count["xhtmlFiles"] += 1
            count["contexts"] += len(contexts)
            count["units"] += len(units)
            for item in root.iter(IX + "nonFraction"):
                count["inlineNumericFacts"] += 1
                ref = item.attrib.get("contextRef", "")
                context = contexts.get(ref)
                unit = units.get(item.attrib.get("unitRef", ""))
                concept = item.attrib.get("name", "")
                prefix, colon, local = concept.partition(":")
                ns = namespaces.get(prefix, "")
                if not colon or "xbrl.ifrs.org/taxonomy/" not in ns or "/ifrs-full" not in ns:
                    continue
                for metric, concepts in METRICS.items():
                    if local not in concepts:
                        continue
                    count["targetConceptFacts"] += 1
                    if not context or not annual_context(context, metric):
                        count["rejectedPeriodEntityOrDimensions"] += 1
                        continue
                    if not unit or len(unit) != 1 or not unit[0].endswith(":EUR"):
                        count["rejectedCurrency"] += 1
                        continue
                    amount = decimal_fact(item, namespaces)
                    if amount is None:
                        count["rejectedNumericTransformation"] += 1
                        continue
                    accepted[metric].append(amount)
                    count["acceptedFacts"] += 1
    metrics, ambiguous = {}, []
    for name in METRICS:
        values = sorted(set(accepted[name]))
        if len(values) == 1:
            metrics[name] = {"valueEur": str(values[0]), "sourceFactCount": len(accepted[name]),
                             "period": YEAR_END if name in INSTANT
                             else YEAR_START + "/" + YEAR_END}
        else:
            metrics[name] = None
            if len(values) > 1:
                ambiguous.append(name)
    assets = metrics["assets"]
    liabs = metrics["liabilities"]
    equity = metrics["equity"]
    difference = None
    consistent = False
    if all((assets, liabs, equity)):
        difference = (Decimal(assets["valueEur"]) - Decimal(liabs["valueEur"])
                      - Decimal(equity["valueEur"]))
        tolerance = max(Decimal("1"), abs(Decimal(assets["valueEur"])) * Decimal("0.005"))
        consistent = abs(difference) <= tolerance
    state = "RESEARCH_FACTS_EXTRACTED_UNCERTIFIED" if count["acceptedFacts"] else "NO_MATCHING_ANNUAL_IFRS_FACTS"
    return final_report(
        state,
        sourceArchiveSha256=digest,
        fetchedDirectlyFromPinnedIssuerUrl=source_is_official,
        sourceZipBytes=len(data),
        scanCounts=dict(count),
        metrics=metrics, ambiguousMetrics=ambiguous,
        balanceSheetNumericConsistency={
            "available": difference is not None, "passed": consistent,
            "differenceEur": str(difference) if difference is not None else None,
        },
        metricValuesRequireIndependentStatementReconciliation=True,
        nextAction="VALIDATE_CONSOLIDATED_ENTITY_CONTEXT_AND_RECONCILE_FINANCIAL_STATEMENTS_SHARES_DEBT_FCF",
    )


def main(argv=None):
    parser = argparse.ArgumentParser()
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--fetch-official", action="store_true")
    src.add_argument("--input")
    parser.add_argument("--output", default="/tmp/fenice-enel-2025-official-esef-audit.json")
    args = parser.parse_args(argv)
    try:
        if args.fetch_official:
            result = audit_zip_bytes(official_bytes(), source_is_official=True)
        else:
            # Caller-provided bytes are never upgraded to official provenance.
            path = Path(args.input)
            if not path.is_file() or path.stat().st_size > MAX_ZIP:
                raise ValueError("LOCAL_ESEF_SOURCE_INVALID")
            result = audit_zip_bytes(path.read_bytes(), source_is_official=False)
    except Exception as error:
        result = final_report("SOURCE_UNAVAILABLE_OR_REJECTED",
                              errorCode=type(error).__name__ + ":" + str(error)[:125],
                              fetchedDirectlyFromPinnedIssuerUrl=False,
                              metrics={}, sourceArchiveSha256=None,
                              nextAction="RETRY_OR_MANUALLY_REVIEW_OFFICIAL_ESEF_ZIP")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": result["mode"], "state": result["state"], "key": result["key"],
        "fetchedDirectlyFromPinnedIssuerUrl": result["fetchedDirectlyFromPinnedIssuerUrl"],
        "archiveSha256": result.get("sourceArchiveSha256"),
        "verifiedMetricNames": [k for k, v in result.get("metrics", {}).items() if v],
        "ambiguousMetricNames": result.get("ambiguousMetrics", []),
        "balanceSheetNumericConsistency": result.get("balanceSheetNumericConsistency"),
        "nextAction": result["nextAction"], "liveTradingAllowed": False,
        "approvedForStrategicPaper": False, "phase9Credit": 0,
    }))
    return 0  # An unavailable network source is reported, never fabricated.


if __name__ == "__main__":
    sys.exit(main())
