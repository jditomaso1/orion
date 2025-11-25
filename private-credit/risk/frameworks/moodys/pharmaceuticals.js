// ratings/frameworks/moodys/pharmaceuticals.js
// Moody’s Pharmaceuticals scorecard (15 Sep 2025)

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/pharmaceuticals';

/**
 * Inputs (units per methodology):
 * - Revenue (USD bn)
 * - Leverage & coverage: Debt/EBITDA (x), EBIT/Interest (x), RCF/Net Debt (%; w/ net-cash special cases)
 * - Business Profile: Product & Therapeutic Diversity (qualitative)
 * - Financial Policy: qualitative
 * Notes:
 *  • Methodology replaces CFO/Debt with RCF/Net Debt and the legacy cash-coverage metric with EBIT/Interest.  [oai_citation:1‡Rating Methodology_ Pharmaceuticals.pdf](file-service://file-NQT6NPVKquqzt4XwsfDqVh)
 *  • Exhibit 2 shows Revenue weighted at 25% and Product & Therapeutic Diversity at 10%.  [oai_citation:2‡Rating Methodology_ Pharmaceuticals.pdf](file-service://file-NQT6NPVKquqzt4XwsfDqVh)
 */
export const fields = [
  // Quantitative
  { id:'revenue',   label:'Revenue (USD, billions)',           type:'number', step:'0.01' },
  { id:'debt',      label:'Total Debt (USD, billions)',        type:'number', step:'0.01' },
  { id:'ebitda',    label:'EBITDA (USD, billions)',            type:'number', step:'0.01' },
  { id:'ebit',      label:'EBIT (USD, billions)',              type:'number', step:'0.01' },
  { id:'interest',  label:'Interest Expense (USD, billions)',  type:'number', step:'0.001' },
  { id:'rcfPct',    label:'RCF / Net Debt (%)',                type:'number', step:'0.1', placeholder:'e.g., 35 = 35%' },
  { id:'netDebt',   label:'Net Debt (USD, billions)',          type:'number', step:'0.01', placeholder:'Debt – Cash' },

  // Business Profile (qualitative)
  { id:'prodTheraDiv', label:'Product & Therapeutic Diversity', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },

  // Financial Policy (qualitative)
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights
 * Confirmed from methodology:
 *  - Revenue (Scale) = 25%
 *  - Product & Therapeutic Diversity (Business Profile) = 10%
 * The remaining weights follow Moody’s corporate pattern for this sector and will be
 * tightened once all subfactor bands are extracted.  [oai_citation:3‡Rating Methodology_ Pharmaceuticals.pdf](file-service://file-NQT6NPVKquqzt4XwsfDqVh)
 */
const W = {
  // Scale / Business Profile
  revenue: 0.25,
  prodTheraDiv: 0.10,

  // Leverage & Coverage (provisional split; to be fine-tuned from full table)
  debtEbitda: 0.20,
  rcfNetDebt: 0.15,
  ebitInterest: 0.15,

  // Financial Policy
  financialPolicy: 0.15,
};

/**
 * Linear endpoints (Aaa ↔ Ca) consistent with Exhibit 2 ranges and the sector update:
 *  - Revenue: Aaa band tops at $30–60bn → use best=60, worst=0.25 (bn).  [oai_citation:4‡Rating Methodology_ Pharmaceuticals.pdf](file-service://file-NQT6NPVKquqzt4XwsfDqVh)
 *  - Debt/EBITDA: best 0x → worst 10x (neg. EBITDA ⇒ worst).
 *  - RCF/Net Debt: best 70% → worst 0%; special cases when Net Debt < 0 (net cash).
 *  - EBIT/Interest: best 25x → worst 0x.
 *  (We’ll lock exact cutoffs to the scorecard table as we ingest the full rows.)
 */
const BANDS = {
  revenue:        { best: 60.0, worst: 0.25, higherIsBetter: true },
  debtEbitda:     { best:  0.0, worst: 10.0, higherIsBetter: false },
  rcfNetDebt_pos: { best: 70.0, worst:  0.0, higherIsBetter: true },
  ebitInterest:   { best: 25.0, worst:  0.0, higherIsBetter: true },
};

// Coverage helper for 0/≤0 interest
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numerics
  const revenue   = Number(inputs.revenue);
  const debt      = Number(inputs.debt);
  const ebitda    = Number(inputs.ebitda);
  const ebit      = Number(inputs.ebit);
  const interest  = Number(inputs.interest);
  const rcfPct    = Number(inputs.rcfPct);
  const netDebt   = Number(inputs.netDebt);

  // Debt / EBITDA
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative EBITDA → worst in our numeric scale

  // EBIT / Interest
  const cov = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // RCF / Net Debt special cases (net cash convention used in our Moody’s modules)
  let sRCF;
  if (netDebt < 0) {
    // Net cash: best if RCF>0, worst if RCF≤0
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Normalize quantitative subfactors
  const sRev = interp(revenue,  BANDS.revenue.best,  BANDS.revenue.worst,  BANDS.revenue.higherIsBetter);
  const sLev = (d2e < 0) ? 20.5 : interp(d2e,       BANDS.debtEbitda.best, BANDS.debtEbitda.worst, BANDS.debtEbitda.higherIsBetter);
  const sCov = interp(cov,       BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);

  // Qualitative → numeric (Aaa..Ca mapping from engine)
  const qPTD = QUAL_TO_NUM[inputs.prodTheraDiv];
  const qFP  = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate → rating
  const agg =
      sRev * W.revenue +
      qPTD * W.prodTheraDiv +
      sLev * W.debtEbitda +
      sRCF * W.rcfNetDebt +
      sCov * W.ebitInterest +
      qFP  * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers
  const drivers = [];
  if (d2e >= 4.0) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (cov <= 3)   drivers.push('Weak EBIT/Interest coverage.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if (revenue >= 15) drivers.push('Large scale supports business strength.');
  if (inputs.prodTheraDiv?.startsWith('A')) drivers.push('Strong product & therapeutic diversification.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Revenue: revenue,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Net Debt (%)': rcfPct,
      'EBIT/Interest (x)': cov,
    },
    factors: { sRev, qPTD, sLev, sRCF, sCov, qFP },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
