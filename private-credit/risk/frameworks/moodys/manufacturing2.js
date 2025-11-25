
// ratings/frameworks/moodys/manufacturing.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/manufacturing';

/**
 * Inputs (units match methodology):
 * - Revenue: USD billions
 * - Margins & cash-flow ratios: %
 * - Multiples/coverage: x
 */
export const fields = [
  // Quantitative
  { id:'revenue',      label:'Revenue (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitaMargin',  label:'EBITA Margin (%)',        type:'number', step:'0.1'  },
  { id:'debt',         label:'Total Debt (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitda',       label:'EBITDA (USD, billions)',     type:'number', step:'0.01' },

  { id:'rcf',          label:'RCF / Net Debt (%)',      type:'number', step:'0.1',  placeholder:'e.g., 35 for 35%' },
  { id:'netDebt',      label:'Net Debt (USD, billions)', type:'number', step:'0.01', placeholder:'Debt – Cash' },
  { id:'fcfDebt',      label:'FCF / Debt (%)',          type:'number', step:'0.1'  },

  { id:'interest',     label:'Interest Expense (USD, billions)', type:'number', step:'0.001' },
  { id:'ebita',        label:'EBITA (USD, billions)',    type:'number', step:'0.01' },

  // Qualitative
  { id:'businessProfile', label:'Business Profile', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights — Moody’s Manufacturing scorecard:
 * Scale 20% (Revenue)
 * Business Profile 25% (qual)
 * Profitability & Efficiency 5% (EBITA Margin)
 * Leverage & Coverage 35% split:
 *   - Debt/EBITDA 10%
 *   - RCF/Net Debt 10%
 *   - FCF/Debt 5%
 *   - EBITA/Interest 10%
 * Financial Policy 15% (qual)   [oai_citation:1‡Rating Methodology_ Manufacturing.pdf](file-service://file-6kJmYgjFN5hH9GvXRade25)
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
 * Linear scoring endpoints (Aaa ↔ Ca) per footnotes:   [oai_citation:2‡Rating Methodology_ Manufacturing.pdf](file-service://file-6kJmYgjFN5hH9GvXRade25)
 * - Revenue: Aaa 75B → Ca 0
 * - EBITA margin: Aaa 50% → Ca -5%
 * - Debt/EBITDA: Aaa 0x → Ca 12x; negative D/EBITDA → 20.5
 * - RCF/Net Debt (if Net Debt > 0): Aaa 80% → Ca -5%;
 *     Net Debt < 0 and RCF > 0 → 0.5; Net Debt < 0 and RCF ≤ 0 → 19.5
 * - FCF/Debt: Aaa 35% → Ca -10%
 * - EBITA/Interest: Aaa 30x → Ca 0x
 */
const BANDS = {
  revenue:        { best: 75.0, worst: 0.0,   higherIsBetter: true },
  ebitaMargin:    { best: 50.0, worst: -5.0,  higherIsBetter: true },
  d2e:            { best: 0.0,  worst: 12.0,  higherIsBetter: false },
  rcfNetDebt_pos: { best: 80.0, worst: -5.0,  higherIsBetter: true }, // when net debt > 0
  fcfDebt:        { best: 35.0, worst: -10.0, higherIsBetter: true },
  ebitaInterest:  { best: 30.0, worst: 0.0,   higherIsBetter: true },
};

function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse
  const revenue = Number(inputs.revenue);
  const ebitaMargin = Number(inputs.ebitaMargin); // %
  const debt = Number(inputs.debt);
  const ebitda = Number(inputs.ebitda);
  const netDebt = Number(inputs.netDebt);
  const rcfPct = Number(inputs.rcf);       // %
  const fcfDebtPct = Number(inputs.fcfDebt); // %
  const interest = Number(inputs.interest);
  const ebita = Number(inputs.ebita);

  // Debt/EBITDA (negative EBITDA → worst cap)
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // signal to cap at 20.5 per footnote   [oai_citation:3‡Rating Methodology_ Manufacturing.pdf](file-service://file-6kJmYgjFN5hH9GvXRade25)

  // EBITA/Interest
  const ebitaInterest = safeCoverage(ebita, interest, BANDS.ebitaInterest.best, BANDS.ebitaInterest.worst);

  // Quantitative → numeric
  const sRevenue = interp(revenue, BANDS.revenue.best, BANDS.revenue.worst, BANDS.revenue.higherIsBetter);
  const sMargin  = interp(ebitaMargin, BANDS.ebitaMargin.best, BANDS.ebitaMargin.worst, BANDS.ebitaMargin.higherIsBetter);

  const sD2E = (d2e < 0) ? 20.5 : interp(d2e, BANDS.d2e.best, BANDS.d2e.worst, BANDS.d2e.higherIsBetter);

  let sRCF;
  if (netDebt < 0) {
    sRCF = (rcfPct > 0) ? 0.5 : 19.5; // special cases when net debt is negative   [oai_citation:4‡Rating Methodology_ Manufacturing.pdf](file-service://file-6kJmYgjFN5hH9GvXRade25)
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  const sFCF = interp(fcfDebtPct, BANDS.fcfDebt.best, BANDS.fcfDebt.worst, BANDS.fcfDebt.higherIsBetter);
  const sCov = interp(ebitaInterest, BANDS.ebitaInterest.best, BANDS.ebitaInterest.worst, BANDS.ebitaInterest.higherIsBetter);

  // Qualitative
  const qBusiness  = QUAL_TO_NUM[inputs.businessProfile];
  const qFinPolicy = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate numeric → rating
  const agg =
      sRevenue   * W.scale +
      qBusiness  * W.businessProfile +
      sMargin    * W.profitability +
      sD2E       * W.d2e +
      sRCF       * W.rcfNetDebt +
      sFCF       * W.fcfDebt +
      sCov       * W.ebitaInterest +
      qFinPolicy * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (brief heuristics)
  const drivers = [];
  if (d2e >= 4.75) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitaInterest <= 3) drivers.push('Low EBITA/Interest constrains debt service capacity.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Weak RCF relative to net debt.');
  if (fcfDebtPct <= 0) drivers.push('Negative FCF/Debt weakens cash flow resilience.');
  if (ebitaMargin >= 25) drivers.push('Strong EBITA margin supports profitability.');
  if (revenue >= 15) drivers.push('Scale supports business strength.');
  if (inputs.businessProfile?.startsWith('A')) drivers.push('Strong Business Profile assessment.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative Financial Policy supports rating.');

  return {
    metrics: {
      Revenue: revenue,
      'EBITA Margin (%)': ebitaMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Net Debt (%)': rcfPct,
      'FCF/Debt (%)': fcfDebtPct,
      'EBITA/Interest (x)': ebitaInterest,
    },
    factors: { sRevenue, sMargin, sD2E, sRCF, sFCF, sCov, qBusiness, qFinPolicy },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
