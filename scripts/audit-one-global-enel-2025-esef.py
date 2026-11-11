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
MAX_UNCOMPRESSED = 640 * 1024 * 1024
MAX_XHTML = 500 * 1024 * 1024
MAX_FILES = 5000
MAX_FACTS = 100000
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
            "validLEIScheme": scheme.rstrip("/") in {
                "http://standards.iso.org/iso/17442",
                "https://standards.iso.org/iso/17442",
            },
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


class GuardedXhtmlStream:
    """Reject inline entity declarations even when split across ZIP reads.

    A harmless <!DOCTYPE html> may appear in valid issuer XHTML; internal
    DTD entity declarations are never needed for extracting annual IFRS data.
    """
    def __init__(self, reader):
        self.reader = reader
        self.tail = b""

    def read(self, size=-1):
        block = self.reader.read(size if size >= 0 else 65536)
        combined = (self.tail + block).upper()
        if b"<!ENTITY" in combined:
            raise ValueError("ESEF_XHTML_DOCTYPE_OR_ENTITIES_FORBIDDEN")
        self.tail = combined[-40:]
        return block


def audit_zip_bytes(data, *, source_is_official=False):
    if not isinstance(data, bytes) or not data or len(data) > MAX_ZIP:
        raise ValueError("ESEF_ZIP_SIZE_INVALID")
    digest = hashlib.sha256(data).hexdigest()
    accepted = defaultdict(list)
    count = Counter()
    xhtml_files = []
    rejected_numeric_samples = []
    with zipfile.ZipFile(BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) > MAX_FILES:
            raise ValueError("ESEF_ZIP_TOO_MANY_ENTRIES")
        total = 0
        for member in members:
            name = member.filename
            path = PurePosixPath(name)
            if (name.startswith("/") or "\\" in name or ".." in path.parts
                    or not name or stat.S_ISLNK(member.external_attr >> 16)):
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
            # An issuer's full XHTML annual report may exceed 100 MiB.
            # Parse the ZIP member as a stream, retain only contexts/units and
            # bounded numeric facts, release XML subtrees as they are scanned.
            namespaces, contexts, units, pending = {}, {}, {}, []
            protected = 0
            root = None
            ended = 0
            with archive.open(member, "r") as file:
                for event, element in ET.iterparse(
                        GuardedXhtmlStream(file), events=("start-ns", "start", "end")):
                    if event == "start-ns":
                        prefix, uri = element
                        if prefix in namespaces and namespaces[prefix] != uri:
                            raise ValueError("ESEF_NAMESPACE_PREFIX_REASSIGNED")
                        namespaces[prefix] = uri
                        continue
                    if event == "start":
                        if root is None:
                            root = element
                        if element.tag in {XBRLI + "context", XBRLI + "unit", IX + "nonFraction"}:
                            protected += 1
                        continue
                    ended += 1
                    if element.tag == XBRLI + "context":
                        context_id = element.attrib.get("id")
                        if not context_id or context_id in contexts:
                            raise ValueError("ESEF_DUPLICATE_OR_MISSING_CONTEXT_ID")
                        entity = xml_child(element, "entity")
                        identifier = xml_child(entity, "identifier")
                        period = xml_child(element, "period")
                        scheme = identifier.attrib.get("scheme", "") if identifier is not None else ""
                        contexts[context_id] = {
                            "lei": text_of(identifier),
                            "validLEIScheme": scheme.rstrip("/") in {
                                "http://standards.iso.org/iso/17442",
                                "https://standards.iso.org/iso/17442",
                            },
                            "dimensional": xml_child(entity, "segment") is not None
                            or xml_child(element, "scenario") is not None,
                            "start": text_of(xml_child(period, "startDate")),
                            "end": text_of(xml_child(period, "endDate")),
                            "instant": text_of(xml_child(period, "instant")),
                        }
                    elif element.tag == XBRLI + "unit":
                        unit_id = element.attrib.get("id")
                        if not unit_id or unit_id in units:
                            raise ValueError("ESEF_DUPLICATE_OR_MISSING_UNIT_ID")
                        units[unit_id] = [text_of(x) for x in element.iter(XBRLI + "measure")]
                    elif element.tag == IX + "nonFraction":
                        count["inlineNumericFacts"] += 1
                        if len(pending) >= MAX_FACTS:
                            raise ValueError("ESEF_IXBRL_TOO_MANY_NUMERIC_FACTS")
                        pending.append((element.attrib.copy(), text_of(element)))
                    if element.tag in {XBRLI + "context", XBRLI + "unit", IX + "nonFraction"}:
                        protected -= 1
                    if protected == 0:
                        element.clear()
                        if root is not None and ended % 2048 == 0:
                            root.clear()
            count["xhtmlFiles"] += 1
            count["contexts"] += len(contexts)
            count["units"] += len(units)
            for attrs, value_text in pending:
                ref = attrs.get("contextRef", "")
                context = contexts.get(ref)
                unit = units.get(attrs.get("unitRef", ""))
                concept = attrs.get("name", "")
                prefix, colon, local = concept.partition(":")
                ns = namespaces.get(prefix, "")
                if not colon or not re.fullmatch(
                    r"https?://xbrl\.ifrs\.org/taxonomy/\d{4}-\d{2}-\d{2}/ifrs-full/?", ns
                ):
                    continue
                for metric, concepts in METRICS.items():
                    if local not in concepts:
                        continue
                    count["targetConceptFacts"] += 1
                    if not context or not annual_context(context, metric):
                        count["rejectedPeriodEntityOrDimensions"] += 1
                        continue
                    u_prefix, u_colon, u_local = unit[0].partition(":") if unit and len(unit) == 1 else ("", "", "")
                    if not u_colon or u_local != "EUR" or namespaces.get(u_prefix) != (
                        "http://www.xbrl.org/2003/iso4217"
                    ):
                        count["rejectedCurrency"] += 1
                        continue
                    item = ET.Element(IX + "nonFraction", attrs)
                    item.text = value_text
                    amount = decimal_fact(item, namespaces)
                    if amount is None:
                        count["rejectedNumericTransformation"] += 1
                        if len(rejected_numeric_samples) < 8:
                            rejected_numeric_samples.append({
                                "metric": metric,
                                "format": attrs.get("format"),
                                "scale": attrs.get("scale"),
                                "sign": attrs.get("sign"),
                                "unverifiedDisplayedText": value_text[:100],
                                "notCertifiedNumericFact": True,
                            })
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
        rejectedNumericFormatExamples=rejected_numeric_samples,
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
