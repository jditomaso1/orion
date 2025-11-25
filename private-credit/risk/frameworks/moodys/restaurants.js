// ratings/frameworks/moodys/restaurants.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/restaurants';

/**
 * Inputs (units match methodology):
 * - Revenue: USD billions
 * - ROA: % (NPATBUI / Avg. Assets) per Moody's definition
 * - Leverage & Coverage: Debt/EBITDA (x), EBIT/Interest (x), RCF/Debt (%)
 * - Qualitative subfactors for Scale (systemwide restaurants, geographic reach),
 *   Business Profile (brand diversity, brand strength), and Financial Policy.
 * Source: Moody’s Restaurants methodology (2 Sep 2025).  [oai_citation:1‡Rating Methodology_ Restaurants.pdf](file-service://file-L5HwBhVLGhENb66nVGnUWg)
 */
export const fields = [
  // Quantitative
  { id:'revenue',   label:'Revenue (USD, billions)', type:'number', step:'0.01' },
  { id:'roa',       label:'ROA (%)',                 type:'number', step:'0.1',  placeholder:'NPATBUI / Avg. Assets' },
  { id:'debt',      label:'Total Debt (USD, billions)', type:'number', step:'0.01' },
  { id:'ebitda',    label:'EBITDA (USD, billions)',     type:'number', step:'0.01' },
  { id:'ebit',      label:'EBIT (USD, billions)',        type:'number', step:'0.01' },
  { id:'interest',  label:'Interest Expense (USD, billions)', type:'number', step:'0.001' },
  { id:'rcfDebt',   label:'RCF / Debt (%)',           type:'number', step:'0.1' },

  // Qualitative — Scale subfactors
  { id:'unitScale', label:'Number of Systemwide Restaurants (qualitative band)', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'geoReach',  label:'Revenue by Geographic Region (qualitative band)', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },

  // Qualitative — Business Profile subfactors
  { id:'brandDiversity', label:'Brand Diversity', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'brandStrength',  label:'Brand Strength (SSS, traffic, product pipeline)', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },

  // Qualitative — Financial Policy
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Scorecard Weights (Restaurants, 2 Sep 2025):  [oai_citation:2‡Rating Methodology_ Restaurants.pdf](file-service://file-L5HwBhVLGhENb66nVGnUWg)
 * Scale 20% → Revenue 10%, Systemwide Restaurants 5%, Geographic Region 5%
 * Business Profile 10% → Brand Diversity 5%, Brand Strength 5%
 * Profitability & Efficiency 10% → ROA 10%
 * Leverage & Coverage 45% → Debt/EBITDA 15%, RCF/Debt 15%, EBIT/Interest 15%
 * Financial Policy 15%
 */
const W = {
  // Scale
  revenue: 0.10,
  unitScale: 0.05,
  geoReach: 0.05,
  // Business Profile
  brandDiversity: 0.05,
  brandStrength: 0.05,
  // Profitability & Efficiency
  roa: 0.10,
  // Leverage & Coverage
  debtEbitda: 0.15,
  rcfDebt: 0.15,
  ebitInterest: 0.15,
  // Financial Policy
  financialPolicy: 0.15,
};

/**
 * Linear scoring endpoints (Aaa ↔ Ca) aligned to the Restaurants scorecard.
 * Where the methodology provides bands, we set reasonable Aaa/Ca endpoints
 * for linear interpolation consistent with the grid.  [oai_citation:3‡Rating Methodology_ Restaurants.pdf](file-service://file-L5HwBhVLGhENb66nVGnUWg)
 *
 *  - Revenue (USD bn): Aaa ≈ 40 → Ca 0
 *  - ROA (%): Aaa 15 → Ca 0
 *  - Debt/EBITDA (x): Aaa 1 → Ca 8  (negative EBITDA ⇒ worst)
 *  - RCF/Debt (%): Aaa 55 → Ca 0
 *  - EBIT/Interest (x): Aaa 12 → Ca 0.5
 */
const BANDS = {
  revenue:      { best: 40.0, worst: 0.0,   higherIsBetter: true },
  roa:          { best: 15.0, worst: 0.0,   higherIsBetter: true },
  debtEbitda:   { best: 1.0,  worst: 8.0,   higherIsBetter: false },
  rcfDebt:      { best: 55.0, worst: 0.0,   higherIsBetter: true },
  ebitInterest: { best: 12.0, worst: 0.5,   higherIsBetter: true },
};

// Helper for coverage when interest is <= 0
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numerics
  const revenue    = Number(inputs.revenue);
  const roa        = Number(inputs.roa);
  const debt       = Number(inputs.debt);
  const ebitda     = Number(inputs.ebitda);
  const ebit       = Number(inputs.ebit);
  const interest   = Number(inputs.interest);
  const rcfDebtPct = Number(inputs.rcfDebt);

  // Ratios
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative EBITDA → worst numeric per linear-scale convention

  const ebitInterest = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // Quantitative → numeric (0.5 best … 20.5 worst scale used by engine)
  const sRevenue = interp(revenue, BANDS.revenue.best, BANDS.revenue.worst, BANDS.revenue.higherIsBetter);
  const sROA     = interp(roa,     BANDS.roa.best,     BANDS.roa.worst,     BANDS.roa.higherIsBetter);
  const sLev     = (d2e < 0) ? 20.5 : interp(d2e,      BANDS.debtEbitda.best,BANDS.debtEbitda.worst,  BANDS.debtEbitda.higherIsBetter);
  const sRCF     = interp(rcfDebtPct, BANDS.rcfDebt.best, BANDS.rcfDebt.worst, BANDS.rcfDebt.higherIsBetter);
  const sCov     = interp(ebitInterest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);

  // Qualitative → numeric (Aaa..Ca scale)
  const qUnit   = QUAL_TO_NUM[inputs.unitScale];
  const qGeo    = QUAL_TO_NUM[inputs.geoReach];
  const qBDiv   = QUAL_TO_NUM[inputs.brandDiversity];
  const qBStr   = QUAL_TO_NUM[inputs.brandStrength];
  const qFP     = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate numeric → rating
  const agg =
      sRevenue * W.revenue +
      qUnit    * W.unitScale +
      qGeo     * W.geoReach +
      qBDiv    * W.brandDiversity +
      qBStr    * W.brandStrength +
      sROA     * W.roa +
      sLev     * W.debtEbitda +
      sRCF     * W.rcfDebt +
      sCov     * W.ebitInterest +
      qFP      * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (concise heuristics)
  const drivers = [];
  if (d2e >= 4.5) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitInterest <= 2) drivers.push('Weak EBIT/Interest coverage.');
  if (rcfDebtPct <= 5) drivers.push('Low RCF relative to debt.');
  if (roa >= 11) drivers.push('High ROA supports profitability & efficiency.');
  if (revenue >= 5) drivers.push('Scale supports business strength.');
  if (inputs.brandStrength?.startsWith('A')) drivers.push('Strong brand strength & SSS/traffic.');
  if (inputs.brandDiversity?.startsWith('A')) drivers.push('Broad, diversified brand portfolio.');
  if (inputs.geoReach?.startsWith('A')) drivers.push('Wide geographic reach reduces volatility.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Revenue: revenue,
      'ROA (%)': roa,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Debt (%)': rcfDebtPct,
      'EBIT/Interest (x)': ebitInterest,
    },
    factors: {
      sRevenue, sROA, sLev, sRCF, sCov,
      qUnit, qGeo, qBDiv, qBStr, qFP
    },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
