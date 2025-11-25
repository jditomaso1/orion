
// ratings/frameworks/moodys/communications-infrastructure.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/communications-infrastructure';

/**
 * Inputs (units match methodology):
 * - Revenue: USD billions
 * - EBITDA Margin: %
 * - (EBITDA - CAPEX) / Interest uses EBITDA, CAPEX, Interest (x)
 * - RCF/Net Debt: % with special handling when Net Debt < 0
 * - Debt/EBITDA: x (derived from Debt & EBITDA)
 * - Qualitative: Market Position & Market Characteristics, Business Model, Financial Policy
 */
export const fields = [
  // Quantitative
  { id:'revenue',       label:'Revenue (USD, billions)',            type:'number', step:'0.01' },
  { id:'ebitdaMargin',  label:'EBITDA Margin (%)',                  type:'number', step:'0.1'  },
  { id:'debt',          label:'Total Debt (USD, billions)',         type:'number', step:'0.01' },
  { id:'ebitda',        label:'EBITDA (USD, billions)',             type:'number', step:'0.01' },
  { id:'capex',         label:'CAPEX (USD, billions)',              type:'number', step:'0.01' },
  { id:'interest',      label:'Interest Expense (USD, billions)',   type:'number', step:'0.001' },
  { id:'rcf',           label:'RCF / Net Debt (%)',                 type:'number', step:'0.1',  placeholder:'e.g., 25 for 25%' },
  { id:'netDebt',       label:'Net Debt (USD, billions)',           type:'number', step:'0.01', placeholder:'Debt – Cash' },

  // Qualitative (Business Profile split) + Financial Policy
  { id:'marketPos',     label:'Market Position & Market Characteristics', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'bizModel',      label:'Business Model',                          type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights per Moody’s Communications Infrastructure scorecard (9/12/2025):
 * - Scale: Revenue 10%
 * - Business Profile 30% split: Market Position & Market Characteristics 15%, Business Model 15%
 * - Profitability & Efficiency: EBITDA Margin 10%
 * - Leverage & Coverage 35% split: (EBITDA - CAPEX)/Interest 15%, RCF/Net Debt 10%, Debt/EBITDA 10%
 * - Financial Policy 15%   [oai_citation:1‡Rating Methodology_ Communications Infrastructure.pdf](file-service://file-6jcbAAEk8M2v2PJ7PjxuDj)
 */
const W = {
  revenue: 0.10,
  marketPos: 0.15,
  bizModel: 0.15,
  ebitdaMargin: 0.10,
  ebitdaCapexInterest: 0.15,
  rcfNetDebt: 0.10,
  debtEbitda: 0.10,
  financialPolicy: 0.15,
};

/**
 * Linear scoring endpoints (Aaa ↔ Ca) per footnotes:   [oai_citation:2‡Rating Methodology_ Communications Infrastructure.pdf](file-service://file-6jcbAAEk8M2v2PJ7PjxuDj)
 * - Revenue: Aaa 60 → Ca 0 (USD bn)
 * - EBITDA Margin: Aaa 120% → Ca 10%
 * - (EBITDA - CAPEX)/Interest: Aaa 18x → Ca 0x
 * - RCF/Net Debt: Aaa 100% → Ca 0%; if Net Debt < 0 and RCF > 0 → 0.5; if Net Debt < 0 and RCF ≤ 0 → 20.5
 * - Debt/EBITDA: Aaa 0x → Ca 12x; negative Debt/EBITDA → 20.5
 */
const BANDS = {
  revenue:        { best: 60.0,  worst: 0.0,   higherIsBetter: true },
  ebitdaMargin:   { best:120.0,  worst:10.0,   higherIsBetter: true },
  ebitdaCapexInt: { best: 18.0,  worst: 0.0,   higherIsBetter: true }, // (EBITDA - CAPEX)/Interest
  rcfNetDebt_pos: { best:100.0,  worst: 0.0,   higherIsBetter: true }, // when net debt > 0
  debtEbitda:     { best:  0.0,  worst:12.0,   higherIsBetter: false },
};

// Safe division for coverage metric
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numbers
  const revenue       = Number(inputs.revenue);
  const ebitdaMargin  = Number(inputs.ebitdaMargin); // %
  const debt          = Number(inputs.debt);
  const ebitda        = Number(inputs.ebitda);
  const capex         = Number(inputs.capex);
  const interest      = Number(inputs.interest);
  const rcfPct        = Number(inputs.rcf);      // %
  const netDebt       = Number(inputs.netDebt);

  // Ratios
  // Debt / EBITDA
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative => cap at worst (20.5) per footnote   [oai_citation:3‡Rating Methodology_ Communications Infrastructure.pdf](file-service://file-6jcbAAEk8M2v2PJ7PjxuDj)

  // (EBITDA - CAPEX) / Interest
  const ebitdaCapexInterest = safeCoverage(ebitda - capex, interest, BANDS.ebitdaCapexInt.best, BANDS.ebitdaCapexInt.worst);

  // Quant → numeric
  const sRevenue = interp(revenue, BANDS.revenue.best, BANDS.revenue.worst, BANDS.revenue.higherIsBetter);
  const sMargin  = interp(ebitdaMargin, BANDS.ebitdaMargin.best, BANDS.ebitdaMargin.worst, BANDS.ebitdaMargin.higherIsBetter);
  const sCov     = interp(ebitdaCapexInterest, BANDS.ebitdaCapexInt.best, BANDS.ebitdaCapexInt.worst, BANDS.ebitdaCapexInt.higherIsBetter);
  const sLev     = (d2e < 0) ? 20.5 : interp(d2e, BANDS.debtEbitda.best, BANDS.debtEbitda.worst, BANDS.debtEbitda.higherIsBetter);

  // RCF / Net Debt special cases
  let sRCF;
  if (netDebt < 0) {
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;  // best if RCF>0; near-worst if RCF≤0   [oai_citation:4‡Rating Methodology_ Communications Infrastructure.pdf](file-service://file-6jcbAAEk8M2v2PJ7PjxuDj)
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Qualitative → numeric
  const qMarket = QUAL_TO_NUM[inputs.marketPos];
  const qBiz    = QUAL_TO_NUM[inputs.bizModel];
  const qFinPol = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate
  const agg =
      sRevenue * W.revenue +
      qMarket  * W.marketPos +
      qBiz     * W.bizModel +
      sMargin  * W.ebitdaMargin +
      sCov     * W.ebitdaCapexInterest +
      sRCF     * W.rcfNetDebt +
      sLev     * W.debtEbitda +
      qFinPol  * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (brief heuristics)
  const drivers = [];
  if (d2e >= 4.5) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitdaCapexInterest <= 2) drivers.push('Weak (EBITDA−CAPEX)/Interest coverage.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if (ebitdaMargin >= 45) drivers.push('High EBITDA margin supports profitability.');
  if (revenue >= 10) drivers.push('Scale supports business strength.');
  if (inputs.marketPos?.startsWith('A')) drivers.push('Strong market position & characteristics.');
  if (inputs.bizModel?.startsWith('A')) drivers.push('Robust business model.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Revenue: revenue,
      'EBITDA Margin (%)': ebitdaMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      '(EBITDA - CAPEX)/Interest (x)': ebitdaCapexInterest,
      'RCF/Net Debt (%)': rcfPct,
    },
    factors: { sRevenue, sMargin, sCov, sRCF, sLev, qMarket, qBiz, qFinPol },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
