// ratings/frameworks/moodys/steel.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/steel';

/**
 * Inputs (units match methodology):
 * - Revenue: USD billions
 * - Margins & cash-flow ratios: %
 * - Multiples/coverage: x
 * - Book Capitalization = Debt + Book Equity (USD billions)
 */
export const fields = [
  // Quantitative
  { id:'revenue',       label:'Revenue (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitMargin',    label:'EBIT Margin (%)',         type:'number', step:'0.1'  },
  { id:'debt',          label:'Total Debt (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitda',        label:'EBITDA (USD, billions)',     type:'number', step:'0.01' },
  { id:'bookCap',       label:'Book Capitalization (Debt + Equity, USD, billions)', type:'number', step:'0.01', placeholder:'Debt + Book Equity' },

  { id:'rcf',           label:'RCF / Net Debt (%)',      type:'number', step:'0.1',  placeholder:'e.g., 30 for 30%' },
  { id:'netDebt',       label:'Net Debt (USD, billions)', type:'number', step:'0.01', placeholder:'Debt – Cash' },

  { id:'interest',      label:'Interest Expense (USD, billions)', type:'number', step:'0.001' },
  { id:'ebit',          label:'EBIT (USD, billions)',     type:'number', step:'0.01' },

  // Qualitative
  { id:'businessProfile', label:'Business Profile', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights — Moody’s Steel scorecard:   [oai_citation:1‡Rating Methodology_ Steel.pdf](file-service://file-Ep8wqHxVvDj7BwYdkfmSod)
 * Scale 20% (Revenue)
 * Business Profile 20% (qual)
 * Profitability & Efficiency 10% (EBIT Margin)
 * Leverage & Coverage 35% split:
 *   - Debt/EBITDA 10%
 *   - Debt/Book Capitalization 10%
 *   - EBIT/Interest 10%
 *   - RCF/Net Debt 5%
 * Financial Policy 15% (qual)
 */
const W = {
  scale: 0.20,
  businessProfile: 0.20,
  profitability: 0.10,
  d2e: 0.10,
  d2bc: 0.10,
  ebitInterest: 0.10,
  rcfNetDebt: 0.05,
  financialPolicy: 0.15,
};

/**
 * Linear scoring endpoints (Aaa ↔ worst) per Steel methodology footnotes.   [oai_citation:2‡Rating Methodology_ Steel.pdf](file-service://file-Ep8wqHxVvDj7BwYdkfmSod)
 * NOTE: The global engine maps 0.5 → 20.5; for footnotes that mention 21.5 as worst,
 * we cap at 20.5 to keep the app’s numeric scale consistent.
 */
const BANDS = {
  revenue:        { best: 150.0, worst: 0.0,   higherIsBetter: true },  // Aaa=150B, worst≈0
  ebitMargin:     { best: 40.0,  worst: -15.0, higherIsBetter: true },  // %
  d2e:            { best: 0.0,   worst: 12.0,  higherIsBetter: false }, // Debt/EBITDA
  d2bc_pct:       { best: 0.0,   worst: 140.0, higherIsBetter: false }, // Debt/Book Cap (%)
  ebitInterest:   { best: 30.0,  worst: -1.0,  higherIsBetter: true },  // EBIT/Interest (x)
  rcfNetDebt_pos: { best: 100.0, worst: -5.0,  higherIsBetter: true },  // when Net Debt > 0
};

// Safe coverage when interest is <= 0
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numbers
  const revenue    = Number(inputs.revenue);
  const ebitMargin = Number(inputs.ebitMargin);   // %
  const debt       = Number(inputs.debt);
  const ebitda     = Number(inputs.ebitda);
  const bookCap    = Number(inputs.bookCap);
  const netDebt    = Number(inputs.netDebt);

  const rcfPct     = Number(inputs.rcf);         // %
  const interest   = Number(inputs.interest);
  const ebit       = Number(inputs.ebit);

  // Ratios
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative -> worst cap per footnote (we map to 20.5)   [oai_citation:3‡Rating Methodology_ Steel.pdf](file-service://file-Ep8wqHxVvDj7BwYdkfmSod)

  // Debt / Book Capitalization (%)
  let d2bc_pct = Infinity;
  if (bookCap > 0) d2bc_pct = (debt / bookCap) * 100;
  else if (bookCap <= 0) d2bc_pct = -1; // negative ratio -> worst cap per footnote   [oai_citation:4‡Rating Methodology_ Steel.pdf](file-service://file-Ep8wqHxVvDj7BwYdkfmSod)

  // EBIT / Interest
  const ebitInterest = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // Quantitative → numeric scores
  const sRevenue  = interp(revenue,    BANDS.revenue.best,      BANDS.revenue.worst,      BANDS.revenue.higherIsBetter);
  const sMargin   = interp(ebitMargin, BANDS.ebitMargin.best,    BANDS.ebitMargin.worst,   BANDS.ebitMargin.higherIsBetter);
  const sD2E      = (d2e   < 0) ? 20.5 : interp(d2e,            BANDS.d2e.best,           BANDS.d2e.worst,           BANDS.d2e.higherIsBetter);
  const sD2BC     = (d2bc_pct < 0) ? 20.5 : interp(d2bc_pct,    BANDS.d2bc_pct.best,      BANDS.d2bc_pct.worst,      BANDS.d2bc_pct.higherIsBetter);
  const sCov      = interp(ebitInterest,BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);

  // RCF / Net Debt special handling
  let sRCF;
  if (netDebt < 0) {
    // When net debt is negative: if RCF > 0 => 0.5 (best); else => 20.5 (near-worst).   [oai_citation:5‡Rating Methodology_ Steel.pdf](file-service://file-Ep8wqHxVvDj7BwYdkfmSod)
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Qualitative → numeric
  const qBusiness  = QUAL_TO_NUM[inputs.businessProfile];
  const qFinPolicy = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate numeric → rating
  const agg =
      sRevenue   * W.scale +
      qBusiness  * W.businessProfile +
      sMargin    * W.profitability +
      sD2E       * W.d2e +
      sD2BC      * W.d2bc +
      sCov       * W.ebitInterest +
      sRCF       * W.rcfNetDebt +
      qFinPolicy * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (brief, human-readable)
  const drivers = [];
  if (d2e >= 4.75) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitInterest <= 3) drivers.push('Weak EBIT/Interest coverage.');
  if (d2bc_pct >= 70) drivers.push('High Debt/Book Capitalization.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if (ebitMargin >= 12) drivers.push('Solid EBIT margin supports profitability.');
  if (revenue >= 10) drivers.push('Scale supports business strength.');
  if (inputs.businessProfile?.startsWith('A')) drivers.push('Strong Business Profile.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative Financial Policy.');

  return {
    metrics: {
      Revenue: revenue,
      'EBIT Margin (%)': ebitMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'Debt/Book Cap (%)': Number.isFinite(d2bc_pct) ? d2bc_pct : Infinity,
      'EBIT/Interest (x)': ebitInterest,
      'RCF/Net Debt (%)': rcfPct,
    },
    factors: { sRevenue, sMargin, sD2E, sD2BC, sCov, sRCF, qBusiness, qFinPolicy },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
