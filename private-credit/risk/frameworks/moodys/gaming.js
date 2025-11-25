// ratings/frameworks/moodys/gaming.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/gaming';

/**
 * Inputs (units match methodology):
 * - Revenue: USD billions
 * - EBIT margin: %
 * - Leverage/Coverage: Debt/EBITDA (x), EBIT/Interest (x)
 * - RCF/Net Debt: %, with special handling when Net Debt < 0
 * - Qualitative Business Profile split: Market Characteristics, Market Position, Diversification
 * - Financial Policy: qualitative
 * Source: Moody’s Gaming methodology (Sept 12, 2025).  [oai_citation:1‡Rating Methodology_ Gaming.pdf](file-service://file-1FZjjcLXeFQ7RUTFKUCN1u)
 */
export const fields = [
  // Quantitative
  { id:'revenue',      label:'Revenue (USD, billions)',       type:'number', step:'0.01' },
  { id:'ebitMargin',   label:'EBIT Margin (%)',               type:'number', step:'0.1'  },
  { id:'debt',         label:'Total Debt (USD, billions)',    type:'number', step:'0.01' },
  { id:'ebitda',       label:'EBITDA (USD, billions)',        type:'number', step:'0.01' },
  { id:'interest',     label:'Interest Expense (USD, billions)', type:'number', step:'0.001' },
  { id:'ebit',         label:'EBIT (USD, billions)',          type:'number', step:'0.01' },
  { id:'rcf',          label:'RCF / Net Debt (%)',            type:'number', step:'0.1', placeholder:'e.g., 25 for 25%' },
  { id:'netDebt',      label:'Net Debt (USD, billions)',      type:'number', step:'0.01', placeholder:'Debt – Cash' },

  // Qualitative (Business Profile split) + Financial Policy
  { id:'marketChar',   label:'Market Characteristics', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'marketPos',    label:'Market Position',        type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'diversification', label:'Diversification',     type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'financialPolicy', label:'Financial Policy',    type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights — Moody’s Gaming scorecard:   [oai_citation:2‡Rating Methodology_ Gaming.pdf](file-service://file-1FZjjcLXeFQ7RUTFKUCN1u)
 * - Scale: Revenue 10%
 * - Business Profile 25% split: Market Characteristics 10%, Market Position 5%, Diversification 10%
 * - Profitability & Efficiency: EBIT Margin 10%
 * - Leverage & Coverage 35% split: Debt/EBITDA 15%, RCF/Net Debt 10%, EBIT/Interest 10%
 * - Financial Policy 20%
 */
const W = {
  revenue: 0.10,
  marketChar: 0.10,
  marketPos: 0.05,
  diversification: 0.10,
  ebitMargin: 0.10,
  debtEbitda: 0.15,
  rcfNetDebt: 0.10,
  ebitInterest: 0.10,
  financialPolicy: 0.20,
};

/**
 * Linear scoring endpoints (Aaa ↔ Ca) and footnotes:   [oai_citation:3‡Rating Methodology_ Gaming.pdf](file-service://file-1FZjjcLXeFQ7RUTFKUCN1u)
 * - Revenue: Aaa 100 → Ca 0 (USD bn)
 * - EBIT Margin: Aaa 75% → Ca 0%
 * - Debt/EBITDA: Aaa 0x → Ca 12x; negative Debt/EBITDA ⇒ numeric 20.5
 * - RCF/Net Debt: if Net Debt > 0 → Aaa 100% → Ca 0%;
 *                 if Net Debt < 0 and RCF > 0 ⇒ 0.5; if Net Debt < 0 and RCF ≤ 0 ⇒ 20.5
 * - EBIT/Interest: Aaa 35x → Ca 0x
 */
const BANDS = {
  revenue:        { best:100.0, worst: 0.0,  higherIsBetter:true },
  ebitMargin:     { best: 75.0, worst: 0.0,  higherIsBetter:true },
  debtEbitda:     { best:  0.0, worst:12.0,  higherIsBetter:false },
  rcfNetDebt_pos: { best:100.0, worst: 0.0,  higherIsBetter:true },
  ebitInterest:   { best: 35.0, worst: 0.0,  higherIsBetter:true },
};

// Coverage helper for division-by-zero / negative-interest edge cases
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse to numbers
  const revenue    = Number(inputs.revenue);
  const ebitMargin = Number(inputs.ebitMargin);
  const debt       = Number(inputs.debt);
  const ebitda     = Number(inputs.ebitda);
  const interest   = Number(inputs.interest);
  const ebit       = Number(inputs.ebit);
  const rcfPct     = Number(inputs.rcf);
  const netDebt    = Number(inputs.netDebt);

  // Ratios
  // Debt / EBITDA
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // negative → force worst numeric (20.5) per footnote   [oai_citation:4‡Rating Methodology_ Gaming.pdf](file-service://file-1FZjjcLXeFQ7RUTFKUCN1u)

  // EBIT / Interest
  const ebitInterest = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // Quantitative → numeric scores
  const sRevenue  = interp(revenue,    BANDS.revenue.best,      BANDS.revenue.worst,      BANDS.revenue.higherIsBetter);
  const sMargin   = interp(ebitMargin, BANDS.ebitMargin.best,    BANDS.ebitMargin.worst,   BANDS.ebitMargin.higherIsBetter);
  const sLev      = (d2e < 0) ? 20.5 : interp(d2e, BANDS.debtEbitda.best, BANDS.debtEbitda.worst, BANDS.debtEbitda.higherIsBetter);
  const sCov      = interp(ebitInterest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);

  // RCF / Net Debt (special cases when Net Debt < 0)
  let sRCF;
  if (netDebt < 0) {
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;  // best if RCF>0; worst if RCF≤0   [oai_citation:5‡Rating Methodology_ Gaming.pdf](file-service://file-1FZjjcLXeFQ7RUTFKUCN1u)
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Qualitative → numeric
  const qMC   = QUAL_TO_NUM[inputs.marketChar];
  const qMP   = QUAL_TO_NUM[inputs.marketPos];
  const qDiv  = QUAL_TO_NUM[inputs.diversification];
  const qFP   = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate numeric → rating
  const agg =
      sRevenue * W.revenue +
      qMC      * W.marketChar +
      qMP      * W.marketPos +
      qDiv     * W.diversification +
      sMargin  * W.ebitMargin +
      sLev     * W.debtEbitda +
      sRCF     * W.rcfNetDebt +
      sCov     * W.ebitInterest +
      qFP      * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (concise, human-friendly)
  const drivers = [];
  if (d2e >= 4.5) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitInterest <= 2) drivers.push('Weak EBIT/Interest coverage.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if (ebitMargin >= 40) drivers.push('High EBIT margin supports profitability.');
  if (revenue >= 5) drivers.push('Scale supports business strength.');
  if (inputs.marketChar?.startsWith('A')) drivers.push('Favorable market characteristics.');
  if (inputs.marketPos?.startsWith('A')) drivers.push('Strong market position.');
  if (inputs.diversification?.startsWith('A')) drivers.push('Broad diversification across properties/revenue channels.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Revenue: revenue,
      'EBIT Margin (%)': ebitMargin,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'EBIT/Interest (x)': ebitInterest,
      'RCF/Net Debt (%)': rcfPct,
    },
    factors: { sRevenue, sMargin, sLev, sCov, sRCF, qMC, qMP, qDiv, qFP },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
