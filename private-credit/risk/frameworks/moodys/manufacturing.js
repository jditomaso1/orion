// ratings/frameworks/moodys/manufacturing.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/manufacturing';

/**
 * Inputs for Moody’s Manufacturing scorecard
 * Units are aligned with the methodology:
 *  - Revenue in USD billions
 *  - Margins & cash-flow ratios in %
 *  - Multiples and coverage in x
 */
export const fields = [
  // Quantitative
  { id:'revenue',  label:'Revenue (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitaMargin', label:'EBITA Margin (%)', type:'number', step:'0.1' },
  { id:'debt',     label:'Total Debt (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitda',   label:'EBITDA (USD, billions)', type:'number', step:'0.01' },

  // Cash-flow subfactors (enter as % of Debt or Net Debt; use signed numbers for negatives)
  { id:'rcf',      label:'RCF / Net Debt (%)', type:'number', step:'0.1', placeholder:'e.g., 35 for 35%' },
  { id:'netDebt',  label:'Net Debt (USD, billions)', type:'number', step:'0.01', placeholder:'Debt – Cash' },
  { id:'fcfDebt',  label:'FCF / Debt (%)', type:'number', step:'0.1', placeholder:'e.g., 10 for 10%' },

  // Coverage
  { id:'interest', label:'Interest Expense (USD, billions)', type:'number', step:'0.001' },
  { id:'ebita',    label:'EBITA (USD, billions)', type:'number', step:'0.01' },

  // Qualitative
  { id:'businessProfile', label:'Business Profile', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights (Exhibit/scorecard):
 * Scale 20% (Revenue)
 * Business Profile 25% (qual)
 * Profitability & Efficiency 5% (EBITA Margin)
 * Leverage & Coverage 35% split: D/EBITDA 10%, RCF/Net Debt 10%, FCF/Debt 5%, EBITA/Interest 10%
 * Financial Policy 15% (qual)
 * Source: Moody’s Manufacturing methodology (Sept 12, 2025).  [oai_citation:1‡Rating Methodology_ Manufacturing.pdf](file-service://file-C87x1bB2MQYXfXeoR7yAcE)
 */
const W = {
  scale: 0.20,
  businessProfile: 0.25,
  profitability: 0.05,
  d2e: 0.10,
  rcfNetDebt: 0.10,
  fcfDebt: 0.05,
  ebitaInterest: 0.10,
  financialPolicy: 0.15,
};

/**
 * Linear scoring endpoints (footnotes):
 *  - Revenue: Aaa 75B → Ca 0
 *  - EBITA margin: Aaa 50% → Ca -5%
 *  - Debt/EBITDA: Aaa 0x → Ca 12x; negative D/EBITDA => numeric 20.5
 *  - RCF/Net Debt (when Net Debt > 0): Aaa 80% → Ca -5%;
 *      Net Debt < 0 and RCF > 0 => numeric 0.5; Net Debt < 0 and RCF ≤ 0 => numeric 19.5
 *  - FCF/Debt: Aaa 35% → Ca -10%
 *  - EBITA/Interest: Aaa 30x → Ca 0x
 * Source: scorecard & footnotes.  [oai_citation:2‡Rating Methodology_ Manufacturing.pdf](file-service://file-C87x1bB2MQYXfXeoR7yAcE)
 */
const BANDS = {
  revenue:        { best: 75.0, worst: 0.0,   higherIsBetter: true },
  ebitaMargin:    { best: 50.0, worst: -5.0,  higherIsBetter: true },
  d2e:            { best: 0.0,  worst: 12.0,  higherIsBetter: false },
  rcfNetDebt_pos: { best: 80.0, worst: -5.0,  higherIsBetter: true }, // when net debt > 0
  fcfDebt:        { best: 35.0, worst: -10.0, higherIsBetter: true },
  ebitaInterest:  { best: 30.0, worst: 0.0,   higherIsBetter: true },
};

// Helper to compute coverage and leverage safely
function safeRatio(numer, denom, fallbackPos, fallbackNeg) {
  if (denom > 0) return numer / denom;
  if (denom === 0) return fallbackPos; // treat as strong if numerator > 0, else worst
  // denom < 0 -> use explicit fallback selection:
  return numer > 0 ? fallbackPos : fallbackNeg;
}

export async function score(inputs){
  // ---- Derived metrics
  const revenue = Number(inputs.revenue);
  const ebitaMargin = Number(inputs.ebitaMargin); // %
  const debt = Number(inputs.debt);
  const ebitda = Number(inputs.ebitda);
  const netDebt = Number(inputs.netDebt);
  const rcf_pct = Number(inputs.rcf);      // %
  const fcfDebt_pct = Number(inputs.fcfDebt); // %
  const interest = Number(inputs.interest);
  const ebita = Number(inputs.ebita);

  // Debt/EBITDA
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative value signals 20.5 per methodology footnote

  // EBITA / Interest
  const ebitaInterest = safeRatio(ebita, interest, BANDS.ebitaInterest.best, BANDS.ebitaInterest.worst);

  // ---- Quantitative subfactor numeric scores
  const sRevenue     = interp(revenue, BANDS.revenue.best, BANDS.revenue.worst, BANDS.revenue.higherIsBetter);
  const sMargin      = interp(ebitaMargin, BANDS.ebitaMargin.best, BANDS.ebitaMargin.worst, BANDS.ebitaMargin.higherIsBetter);

  let sD2E;
  if (d2e < 0) {
    // negative Debt/EBITDA => worst cap (20.5)
    sD2E = 20.5;
  } else {
    sD2E = interp(d2e, BANDS.d2e.best, BANDS.d2e.worst, BANDS.d2e.higherIsBetter);
  }

  // RCF / Net Debt special cases
  let sRCF;
  if (netDebt < 0) {
    if (rcf_pct > 0) sRCF = 0.5;   // best
    else             sRCF = 19.5;  // near-worst per footnote
  } else {
    sRCF = interp(rcf_pct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  const sFCF        = interp(fcfDebt_pct, BANDS.fcfDebt.best, BANDS.fcfDebt.worst, BANDS.fcfDebt.higherIsBetter);
  const sCov        = interp(ebitaInterest, BANDS.ebitaInterest.best, BANDS.ebitaInterest.worst, BANDS.ebitaInterest.higherIsBetter);

  // ---- Qualitative subfactors
  const qBusiness   = QUAL_TO_NUM[inputs.businessProfile];
  const qFinPolicy  = QUAL_TO_NUM[inputs.financialPolicy];

  // ---- Aggregate numeric (weighted sum)
  const agg =
      sRevenue   * W.scale
    + qBusiness  * W.businessProfile
    + sMargin    * W.profitability
    + sD2E       * W.d2e
    + sRCF       * W.rcfNetDebt
    + sFCF       * W.fcfDebt
    + sCov       * W.ebitaInterest
    + qFinPolicy * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // ---- Drivers (simple heuristics to explain outcomes)
  const drivers = [];
  if (d2e >= 4.75) drivers.push('Elevated leverage (Debt/EBITDA) weighs on Leverage & Coverage.');
  if (ebitaInterest <= 3) drivers.push('Low EBITA/Interest constrains debt service capacity.');
  if (rcf_pct <= 5 && netDebt > 0) drivers.push('Weak RCF relative to net debt.');
  if (fcfDebt_pct <= 0) drivers.push('Negative FCF/Debt weakens cash flow resilience.');
  if (ebitaMargin >= 25) drivers.push('Strong EBITA margin supports profitability.');
  if (revenue >= 15) drivers.push('Scale supports business strength.');
  if (inputs.businessProfile?.startsWith('A')) drivers.push('Strong Business Profile assessment.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative Financial Policy supports rating.');

  return {
    metrics: {
      Revenue: revenue,
      'EBITA Margin (%)': ebitaMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Net Debt (%)': rcf_pct,
      'FCF/Debt (%)': fcfDebt_pct,
      'EBITA/Interest (x)': ebitaInterest,
    },
    factors: {
      sRevenue, sMargin, sD2E, sRCF, sFCF, sCov,
      qBusiness, qFinPolicy
    },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
