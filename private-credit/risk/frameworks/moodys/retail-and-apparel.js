// ratings/frameworks/moodys/retail-and-apparel.js
// Moody’s Retail & Apparel scorecard (weights & endpoints per methodology)

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/retail-and-apparel';

export const fields = [
  // Quantitative inputs (scale & leverage/coverage)
  { id:'revenue',  label:'Revenue (USD, billions)', step:'0.01' },
  { id:'debt',     label:'Total Debt (USD, billions)', step:'0.01' },
  { id:'ebitda',   label:'EBITDA (USD, billions)', step:'0.01' },
  { id:'capex',    label:'Capex (USD, billions)', step:'0.01' },
  { id:'interest', label:'Interest Expense (USD, billions)', step:'0.001' },

  // Qualitative subfactors
  { id:'marketCharacteristics', label:'Market Characteristics', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'marketPosition',       label:'Market Position',       type:'select', options:Object.keys(QUAL_TO_NUM) },

  // Profitability & efficiency (qual in this methodology)
  { id:'revEarnStability',     label:'Revenue & Earnings Stability', type:'select', options:Object.keys(QUAL_TO_NUM) },

  // Financial policy
  { id:'finPolicy',            label:'Financial Policy', type:'select', options:Object.keys(QUAL_TO_NUM) },
];

// === Weights (sum to 1.00) per Moody’s Retail & Apparel scorecard ===
// Scale 15%; Business Profile 20% (Market Characteristics 10%, Market Position 10%);
// Profitability & Efficiency 10% (Revenue & Earnings Stability);
// Leverage & Coverage 40% (Debt/EBITDA 15%, RCF/Net Debt 10%, (EBITDA–Capex)/Interest 15%);
// Financial Policy 15%.
const W = {
  // Business Profile (qual)
  marketCharacteristics: .10,
  marketPosition:       .10,
  // Profitability & Efficiency (qual)
  revEarnStability:     .10,
  // Scale (quant)
  scale:                .15,
  // Leverage & Coverage (quant)
  debtEbitda:           .15,
  rcfNetDebt:           .10,
  ebitdaCapexInterest:  .15,
  // Financial Policy (qual)
  finPolicy:            .15,
};

// === Linear endpoints from methodology footnotes ===
// Revenue: Aaa endpoint = $150bn, Ca endpoint = $0bn (higher is better)  [oai_citation:0‡Rating Methodology_ Retail and Apparel.pdf](file-service://file-5P6QyNiJxZfGU4Jms6f6Ta)
// Debt/EBITDA: Aaa = 0x, Ca = 12x (lower is better)  [oai_citation:1‡Rating Methodology_ Retail and Apparel.pdf](file-service://file-5P6QyNiJxZfGU4Jms6f6Ta)
// RCF/Net Debt: Aaa = 100%, Ca = 0% (higher is better); special cases when net debt < 0 in footnote.  [oai_citation:2‡Rating Methodology_ Retail and Apparel.pdf](file-service://file-5P6QyNiJxZfGU4Jms6f6Ta)
// (EBITDA–Capex)/Interest: Aaa = 25x, Ca = 0x (higher is better).  [oai_citation:3‡Rating Methodology_ Retail and Apparel.pdf](file-service://file-5P6QyNiJxZfGU4Jms6f6Ta)
const BANDS = {
  revenue:  { best:150.0, worst:0.0,  higherIsBetter:true },
  debtEbitda:{ best:0.0,   worst:12.0, higherIsBetter:false },
  rcfNetDebt:{ best:100.0, worst:0.0,  higherIsBetter:true },
  ebitdaCapexInterest:{ best:25.0, worst:0.0, higherIsBetter:true },
};

export async function score(inputs){
  // Core ratios
  const debtEbitda = (inputs.ebitda > 0) ? (inputs.debt / inputs.ebitda) : Infinity;

  // (EBITDA – Capex) / Interest (guard for zero/neg interest)
  let eci;
  if (inputs.interest > 0) {
    eci = (inputs.ebitda - inputs.capex) / inputs.interest;
  } else {
    // If no interest expense, treat as best-case if pre-capex EBITDA positive, worst if negative
    eci = ((inputs.ebitda - inputs.capex) > 0) ? BANDS.ebitdaCapexInterest.best : BANDS.ebitdaCapexInterest.worst;
  }

  // RCF / Net Debt: we don’t have explicit RCF or cash; use a transparent proxy:
  // RCF_proxy ≈ EBITDA – Capex – Interest; NetDebt_proxy ≈ Debt.
  // This matches the directionality and endpoint treatment in the methodology (but is still a proxy).
  // If you later add cash & tax/dividend fields, replace with true RCF and net debt.
  const rcfProxy = (inputs.ebitda ?? 0) - (inputs.capex ?? 0) - (inputs.interest ?? 0);
  const netDebtProxy = inputs.debt ?? 0;
  let rcfNetDebtPct;
  if (netDebtProxy > 0) {
    rcfNetDebtPct = (rcfProxy / netDebtProxy) * 100.0;
  } else if (netDebtProxy < 0 && rcfProxy > 0) {
    // Special case in footnote when net debt < 0 and RCF > 0 → Aaa-equivalent numeric;
    // in normalized space use the best endpoint.
    rcfNetDebtPct = BANDS.rcfNetDebt.best;
  } else {
    rcfNetDebtPct = BANDS.rcfNetDebt.worst;
  }

  // Normalize 0..1 via engine.interp (best = 1, worst = 0 when higherIsBetter true)
  const sRev  = interp(inputs.revenue,           BANDS.revenue.best,             BANDS.revenue.worst,             BANDS.revenue.higherIsBetter);
  const sDE   = interp(debtEbitda,               BANDS.debtEbitda.best,          BANDS.debtEbitda.worst,          BANDS.debtEbitda.higherIsBetter);
  const sRCF  = interp(rcfNetDebtPct,            BANDS.rcfNetDebt.best,          BANDS.rcfNetDebt.worst,          BANDS.rcfNetDebt.higherIsBetter);
  const sECI  = interp(eci,                      BANDS.ebitdaCapexInterest.best, BANDS.ebitdaCapexInterest.worst, BANDS.ebitdaCapexInterest.higherIsBetter);

  // Qualitative mapped using your global scale (e.g., {Exceptional:1.0, Strong:0.85, ...})
  const qMC   = QUAL_TO_NUM[inputs.marketCharacteristics];
  const qMP   = QUAL_TO_NUM[inputs.marketPosition];
  const qRES  = QUAL_TO_NUM[inputs.revEarnStability];
  const qFP   = QUAL_TO_NUM[inputs.finPolicy];

  // Aggregate (0..1) then map to your house letter grade (same mapping used by other frameworks)
  const agg =
      sRev * W.scale +
      qMC  * W.marketCharacteristics +
      qMP  * W.marketPosition +
      qRES * W.revEarnStability +
      sDE  * W.debtEbitda +
      sRCF * W.rcfNetDebt +
      sECI * W.ebitdaCapexInterest +
      qFP  * W.finPolicy;

  const rating = mapAggregateToRating(agg);

  return {
    metrics: {
      Revenue: inputs.revenue,
      'Debt/EBITDA': debtEbitda,
      'RCF/Net Debt (proxy, %)': rcfNetDebtPct,
      '(EBITDA–Capex)/Interest': eci
    },
    factors: {
      sRev, sDE, sRCF, sECI,
      qMC, qMP, qRES, qFP
    },
    numeric: agg,
    rating,
    drivers: [
      'Retail & Apparel: weights and endpoints per methodology.',
      'RCF/Net Debt uses a transparent proxy: RCF≈EBITDA–Capex–Interest; NetDebt≈Debt. Replace with true RCF and net debt when available.'
    ]
  };
}

export default { id, fields, score };
