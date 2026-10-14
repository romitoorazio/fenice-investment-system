/**
 * DCF input eligibility: distinguish a filed cashflow fact from a defensible
 * five-year base. All values are historical/research-only; this gate cannot
 * certify a return, permit broker submission, or mutate PAPER V6.
 */
const nonNegative = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
const currency = x => typeof x === "string" && /^[A-Z]{3}$/.test(x);
export const AUDITED_SINGLE_YEAR_FCF_TO_OCF_MIN = 0.10;

export function checkDcfCashFlowBasis({financials,asset}={}) {
  const f=financials||{};
  if (!nonNegative(f.cash) || !nonNegative(f.debt)) {
    return {
      state:"MISSING_VERIFIED_CASH_OR_DEBT",
      eligible:false,
      reason:"Cassa o debito assenti: non è lecito sostituire il valore mancante con zero nel ponte enterprise/equity.",
      singleYearFcfToOperatingCashFlowPercent:null,
    };
  }
  if (!currency(f.currency) || !currency(asset?.currency) || f.currency!==asset.currency) {
    return {
      state:"CURRENCY_NOT_COMPARABLE",eligible:false,
      reason:"La valuta del bilancio e quella del prezzo devono essere verificate e identiche; nessuna conversione implicita.",
      singleYearFcfToOperatingCashFlowPercent:null,
    };
  }
  const audited=f.cashInvestmentAudit;
  const auditedSingleYear=audited?.applied===true
    && audited?.source==="SEC FILED_ANNUAL_CASH_FLOW_RECONCILIATION"
    && audited?.reportingCurrency===f.currency;
  if (auditedSingleYear && positive(f.operatingCashFlow) && nonNegative(f.freeCashFlow)
      && f.freeCashFlow/f.operatingCashFlow < AUDITED_SINGLE_YEAR_FCF_TO_OCF_MIN) {
    return {
      state:"SINGLE_YEAR_FCF_NOT_NORMALIZED",eligible:false,
      reason:"FCF annuale inferiore al 10% del cash flow operativo dopo investimenti riconciliati: non proiettare un unico esercizio su cinque anni senza serie pluriennale e ipotesi di investimenti.",
      singleYearFcfToOperatingCashFlowPercent:Math.round(10000*f.freeCashFlow/f.operatingCashFlow)/100,
      fiscalEnd:audited.fiscalEnd,
      filingUrl:audited.filingUrl,
      researchOnly:true,requiresMultiYearValidation:true,
    };
  }
  return {
    state:"BASIC_INPUTS_VERIFIED",eligible:true,
    reason:"Cassa, debito e valuta confrontabili; gli altri controlli DCF restano obbligatori.",
    singleYearFcfToOperatingCashFlowPercent:positive(f.operatingCashFlow)&&nonNegative(f.freeCashFlow)
      ? Math.round(10000*f.freeCashFlow/f.operatingCashFlow)/100:null,
    researchOnly:true,
  };
}
