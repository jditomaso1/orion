// ratings/frameworks/moodys/shipping.js
// Moody’s Shipping scorecard implementation

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/shipping';

/**
 * Inputs
 * - Revenue: USD billions
 * - Margins & coverage: %, x
 * - RCF/Net Debt: % (with special handling when Net Debt < 0)
 * - Asset Encumbrance captured as % of fleet UNENCUMBERED (higher is better)
 * - Qualitative: Business Profile, Financial Policy
 */
export const fields = [
  // Quantitative
  { id:'revenue',      label:'Revenue (USD, billions)',            type:'number', step:'0.01' },
  { id:'ebitMargin',   label:'EBIT Margin (%)',                    type:'number', step:'0.1'  },
  { id:'debt',         label:'Total Debt (USD, billions)',         type:'number', step:'0.01' },
  { id:'ebitda',       label:'EBITDA (USD, billions)',             type:'number', step:'0.01' },
  { id:'ebit',         label:'EBIT (USD, billions)',               type:'number', step:'0.01' },
  { id:'interest',     label:'Interest Expense (USD, billions)',   type:'number', step:'0.001' },

  { id:'rcf',          label:'RCF / Net Debt (%)',                 type:'number', step:'0.1',  placeholder:'e.g., 25 for 25%' },
  { id:'netDebt',      label:'Net Debt (USD, billions)',           type:'number', step:'0.01', placeholder:'Debt – Cash' },

  // Asset encumbrance captured as % unencumbered (per scorecard narrative)
  { id:'unencumberedPct', label:'Unencumbered Fleet (%)',         type:'number', step:'0.1',  placeholder:'e.g., 80 for 80%' },

  // Qualitative
  { id:'businessProfile', label:'Business Profile', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights — Shipping scorecard (Moody’s, 16 Sep 2025)   [oai_citation:1‡Rating Methodology_ Shipping.pdf](file-service://file-Hyf4Z6NKyAH5X26i4Ctcdy)
 * Scale 10% → Revenue 10%
 * Business Profile 20% (qual)
 * Profitability & Efficiency 10% → EBIT Margin 10%
 * Leverage & Coverage 40% → Debt/EBITDA 10%, RCF/Net Debt 10%, EBIT/Interest 10%, Asset Encumbrance 10%
 * Financial Policy 20% (qual)
 */
const W = {
  revenue: 0.10,
  businessProfile: 0.20,
  ebitMargin: 0.10,
  debtEbitda: 0.10,
  rcfNetDebt: 0.10,
  ebitInterest: 0.10,
  assetEnc: 0.10,
  financialPolicy: 0.20,
};

/**
 * Linear scoring endpoints (Aaa ↔ Ca) aligned to the table bands   [oai_citation:2‡Rating Methodology_ Shipping.pdf](file-service://file-Hyf4Z6NKyAH5X26i4Ctcdy)
 * - Revenue: Aaa ≈ $60B (top band), Ca ≈ $0
 * - EBIT Margin: Aaa ≈ 60%, Ca ≈ 0%
 * - Debt/EBITDA: Aaa ≈ 0x, Ca ≈ 9.5x (table worst >8.5x; set worst 9.5 for headroom)
 * - RCF/Net Debt: Aaa ≈ 80%, Ca ≈ 0%; special cases when Net Debt < 0 (see below)
 * - EBIT/Interest: Aaa ≈ 20x, Ca ≈ 0x
 * - Asset Encumbrance: model as UNENCUMBERED % — Aaa 95%, Ca 0% (higher is better)
 */
const BANDS = {
  revenue:        { best: 60.0, worst: 0.0,  higherIsBetter: true },
  ebitMargin:     { best: 60.0, worst: 0.0,  higherIsBetter: true },
  debtEbitda:     { best:  0.0, worst: 9.5,  higherIsBetter: false },
  rcfNetDebt_pos: { best: 80.0, worst: 0.0,  higherIsBetter: true }, // when net debt > 0
  ebitInterest:   { best: 20.0, worst: 0.0,  higherIsBetter: true },
  unencPct:       { best: 95.0, worst: 0.0,  higherIsBetter: true },
};

// Coverage helper for 0/≤0 interest
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numerics
  const revenue    = Number(inputs.revenue);
  const ebitMargin = Number(inputs.ebitMargin);
  const debt       = Number(inputs.debt);
  const ebitda     = Number(inputs.ebitda);
  const ebit       = Number(inputs.ebit);
  const interest   = Number(inputs.interest);
  const rcfPct     = Number(inputs.rcf);
  const netDebt    = Number(inputs.netDebt);
  const unencPct   = Number(inputs.unencumberedPct);

  // Debt / EBITDA
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative EBITDA → force worst numeric in our normalized scale

  // EBIT / Interest
  const ebitInterest = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // Quant → numeric scores
  const sRevenue = interp(revenue,    BANDS.revenue.best,    BANDS.revenue.worst,    BANDS.revenue.higherIsBetter);
  const sMargin  = interp(ebitMargin, BANDS.ebitMargin.best,  BANDS.ebitMargin.worst, BANDS.ebitMargin.higherIsBetter);
  const sLev     = (d2e < 0) ? 20.5 : interp(d2e,            BANDS.debtEbitda.best,  BANDS.debtEbitda.worst,  BANDS.debtEbitda.higherIsBetter);
  const sCov     = interp(ebitInterest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);
  const sEnc     = interp(unencPct,   BANDS.unencPct.best,   BANDS.unencPct.worst,   BANDS.unencPct.higherIsBetter);

  // RCF / Net Debt — special cases when net debt < 0 per Moody’s footnote convention
  let sRCF;
  if (netDebt < 0) {
    // If net cash and RCF > 0 → best; if net cash and RCF ≤ 0 → worst.
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Qualitative → numeric
  const qBP = QUAL_TO_NUM[inputs.businessProfile];
  const qFP = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate numeric → rating
  const agg =
      sRevenue * W.revenue +
      qBP      * W.businessProfile +
      sMargin  * W.ebitMargin +
      sLev     * W.debtEbitda +
      sRCF     * W.rcfNetDebt +
      sCov     * W.ebitInterest +
      sEnc     * W.assetEnc +
      qFP      * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (concise)
  const drivers = [];
  if (d2e >= 4.5) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitInterest <= 2) drivers.push('Weak EBIT/Interest coverage.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if ((unencPct || 0) >= 80) drivers.push('High level of unencumbered assets enhances financial flexibility.');
  if (ebitMargin >= 20) drivers.push('Solid EBIT margin supports profitability.');
  if (revenue >= 8) drivers.push('Scale supports business strength.');
  if (inputs.businessProfile?.startsWith('A')) drivers.push('Strong Business Profile.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative Financial Policy.');

  return {
    metrics: {
      Revenue: revenue,
      'EBIT Margin (%)': ebitMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Net Debt (%)': rcfPct,
      'EBIT/Interest (x)': ebitInterest,
      'Unencumbered Fleet (%)': unencPct,
    },
    factors: { sRevenue, sMargin, sLev, sRCF, sCov, sEnc, qBP, qFP },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
