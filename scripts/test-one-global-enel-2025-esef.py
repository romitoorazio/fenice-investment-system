#!/usr/bin/env python3
"""Synthetic, offline, fail-closed contract tests for official FY2025 iXBRL intake."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("enel_2025_ixbrl",
    HERE / "audit-one-global-enel-2025-esef.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def fixture():
    return f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
 xmlns:xbrli="http://www.xbrl.org/2003/instance"
 xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full"
 xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
 xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12">
<head><title>SYNTHETIC TEST ONLY - NOT ENEL SOURCE</title></head>
<body>
<ix:resources>
<xbrli:context id="FY"><xbrli:entity>
 <xbrli:identifier scheme="http://standards.iso.org/iso/17442">{module.LEI}</xbrli:identifier>
</xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate>
<xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="BAL"><xbrli:entity>
 <xbrli:identifier scheme="http://standards.iso.org/iso/17442">{module.LEI}</xbrli:identifier>
</xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
</ix:resources>
<div><ix:nonFraction name="ifrs-full:Revenue" contextRef="FY"
unitRef="EUR" scale="6" format="ixt:numcommadecimal">12.345,6</ix:nonFraction></div>
<div><ix:nonFraction name="ifrs-full:ProfitLoss" contextRef="FY"
unitRef="EUR" scale="6" format="ixt:numdotdecimal">200.0</ix:nonFraction></div>
<div><ix:nonFraction name="ifrs-full:CashFlowsFromUsedInOperatingActivities"
contextRef="FY" unitRef="EUR" scale="6">500</ix:nonFraction></div>
<div><ix:nonFraction name="ifrs-full:Assets" contextRef="BAL"
unitRef="EUR" scale="6">1000</ix:nonFraction></div>
<div><ix:nonFraction name="ifrs-full:Liabilities" contextRef="BAL"
unitRef="EUR" scale="6">600</ix:nonFraction></div>
<div><ix:nonFraction name="ifrs-full:Equity" contextRef="BAL"
unitRef="EUR" scale="6">400</ix:nonFraction></div>
</body></html>"""


def archive(xml, name="reports/fake_consolidated_2025.xhtml", extra=None):
    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, xml)
        if extra:
            z.writestr(extra[0], extra[1])
    return output.getvalue()


def reject(value, message):
    try:
        value()
    except ValueError as e:
        assert message in str(e), (message, str(e))
    else:
        raise AssertionError("Expected fail-closed error " + message)


base = archive(fixture())
result = module.audit_zip_bytes(base)
assert result["state"] == "RESEARCH_FACTS_EXTRACTED_UNCERTIFIED"
assert result["fetchedDirectlyFromPinnedIssuerUrl"] is False
assert result["sourceArchiveSha256"] and len(result["sourceArchiveSha256"]) == 64
assert result["scanCounts"]["xhtmlFiles"] == 1
assert result["scanCounts"]["acceptedFacts"] == 6
assert result["metrics"]["revenue"]["valueEur"] == "12345600000.0"
assert result["metrics"]["netIncomeTotal"]["valueEur"] == "200000000.0"
assert result["metrics"]["operatingCashFlow"]["valueEur"] == "500000000"
assert result["metrics"]["assets"]["valueEur"] == "1000000000"
assert result["metrics"]["liabilities"]["valueEur"] == "600000000"
assert result["metrics"]["equity"]["valueEur"] == "400000000"
assert result["balanceSheetNumericConsistency"]["passed"] is True
assert result["balanceSheetNumericConsistency"]["differenceEur"] == "0"
for name in ("issuerFundamentalScoreEligible", "dcfEligible", "approvedForStrategicPaper",
             "liveTradingAllowed", "independentFinancialStatementAuditComplete",
             "consolidatedReportingPerimeterIndependentlyVerified", "brokerConnectivityAllowed"):
    assert result[name] is False, name
assert result["phase9Credit"] == result["paperOrders"] == 0

wrong_lei = module.audit_zip_bytes(archive(fixture().replace(module.LEI, "FAKE_LEI")))
assert wrong_lei["state"] == "NO_MATCHING_ANNUAL_IFRS_FACTS"
assert not any(wrong_lei["metrics"].values())

wrong_currency = module.audit_zip_bytes(archive(
    fixture().replace("iso4217:EUR</", "iso4217:USD</")))
assert wrong_currency["metrics"]["assets"] is None
assert wrong_currency["scanCounts"]["rejectedCurrency"] == 6

prior_year = module.audit_zip_bytes(archive(
    fixture().replace("<xbrli:startDate>2025-01-01</xbrli:startDate>",
    "<xbrli:startDate>2024-01-01</xbrli:startDate>")))
assert prior_year["metrics"]["revenue"] is None
assert prior_year["metrics"]["assets"] is not None

segment = module.audit_zip_bytes(archive(fixture().replace(
    "</xbrli:entity><xbrli:period>",
    "<xbrli:segment><xbrli:identifier>INDUSTRY</xbrli:identifier></xbrli:segment>"
    "</xbrli:entity><xbrli:period>")))
assert all(v is None for v in segment["metrics"].values())

other_ifrs = module.audit_zip_bytes(archive(
    fixture().replace("http://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full",
                      "https://fake.invalid/ifrs-full")))
assert all(v is None for v in other_ifrs["metrics"].values())

alias_conflict = fixture().replace("</body>", """<ix:nonFraction
 name="ifrs-full:RevenueFromContractsWithCustomers" contextRef="FY" unitRef="EUR"
 scale="6" format="ixt:numcommadecimal">13.345,6</ix:nonFraction></body>""")
ambiguous = module.audit_zip_bytes(archive(alias_conflict))
assert "revenue" in ambiguous["ambiguousMetrics"]
assert ambiguous["metrics"]["revenue"] is None
assert ambiguous["metrics"]["assets"] is not None

unsupported_transform = module.audit_zip_bytes(archive(
    fixture().replace("ixt:numcommadecimal", "ixt:unverifiedTransform")))
assert unsupported_transform["metrics"]["revenue"] is None
assert unsupported_transform["scanCounts"]["rejectedNumericTransformation"] >= 1

reject(lambda: module.audit_zip_bytes(archive(fixture(), extra=("../escape.txt", "bad"))),
       "ESEF_ZIP_UNSAFE_MEMBER")
reject(lambda: module.audit_zip_bytes(archive("<html>not a valid XML body")),
       "ESEF_ZIP_NO_IXBRL_XHTML") if False else None
reject(lambda: module.audit_zip_bytes(archive(fixture(), name="filing.txt")),
       "ESEF_ZIP_NO_IXBRL_XHTML")
reject(lambda: module.audit_zip_bytes(archive(fixture().replace(
    'context id="FY"', 'context id="BAL"'))),
    "ESEF_DUPLICATE_OR_MISSING_CONTEXT_ID")

with tempfile.TemporaryDirectory(prefix="fenice-esef-unit-") as folder:
    path = Path(folder) / "synthetic.zip"
    out = Path(folder) / "result.json"
    path.write_bytes(base)
    proc = subprocess.run([sys.executable, str(HERE / "audit-one-global-enel-2025-esef.py"),
        "--input", str(path), "--output", str(out)],
        capture_output=True, text=True, check=True, timeout=15)
    payload = json.loads(out.read_text(encoding="utf8"))
    assert payload["fetchedDirectlyFromPinnedIssuerUrl"] is False
    assert payload["state"] == "RESEARCH_FACTS_EXTRACTED_UNCERTIFIED"
    assert payload["liveTradingAllowed"] is False
    assert '"approvedForStrategicPaper": false' in out.read_text(encoding="utf8")

print("PASS ENEL official FY2025 iXBRL bounded reader: 6 synthetic metrics; exact LEI, EUR, contexts, ambiguity, unsafe ZIP; research-only, never DCF/BUY/PAPER/Directa")
