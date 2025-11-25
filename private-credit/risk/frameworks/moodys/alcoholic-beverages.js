
// ratings/frameworks/moodys/alcoholic-beverages.js
// Moody’s Alcoholic Beverages scorecard (12 Sep 2025)   [oai_citation:0‡Rating Methodology_ Alcoholic Beverages.pdf](file-service://file-JD8HwXXeUXEP5qanZWTc5U)

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/alcoholic-beverages';

/**
 * Inputs (units per methodology):
 * - Revenue: USD billions
 * - EBITA margin: %
 * - Leverage & coverage: Debt/EBITDA (x), EBIT/Interest (x), RCF/Net Debt (% with net-cash special cases)
 * - Business Profile (qual): Diversification & Exposure to Riskier Markets; Category/Brand Strength & Diversification;
 *   Global Industry Position; Innovation/Distribution/Infrastructure
 * - Financial Policy (qual)
 * Source: Moody’s Alcoholic Beverages methodology (12-Sep-2025).   [oai_citation:1‡Rating Methodology_ Alcoholic Beverages.pdf](file-service://file-JD8HwXXeUXEP5qanZWTc5U)
 */
export const fields = [
  // Quantitative
  { id:'revenue',      label:'Revenue (USD, billions)',            type:'number', step:'0.01' },
  { id:'ebitaMargin',  label:'EBITA Margin (%)',                   type:'number', step:'0.1'  },
  { id:'debt',         label:'Total Debt (USD, billions)',         type:'number', step:'0.01' },
  { id:'ebitda',       label:'EBITDA (USD, billions)',             type:'number', step:'0.01' },
  { id:'ebit',         label:'EBIT (USD, billions)',               type:'number', step:'0.01' },
  { id:'interest',     label:'Interest Expense (USD, billions)',   type:'number', step:'0.001' },
  { id:'rcf',          label:'RCF / Net Debt (%)',                 type:'number', step:'0.1',  placeholder:'e.g., 35 for 35%' },
  { id:'netDebt',      label:'Net Debt (USD, billions)',           type:'number', step:'0.01', placeholder:'Debt – Cash' },

  // Business Profile subfactors (qualitative bands Aaa..Ca)
  { id:'diversRisk',   label:'Diversification & Exposure to Riskier Markets', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'brandStrength',label:'Category / Brand Strength & Diversification',   type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'industryPos',  label:'Global Industry Position',                       type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
  { id:'innovation',   label:'Innovation, Distribution & Infrastructure',      type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },

  // Financial policy (qualitative)
  { id:'financialPolicy', label:'Financial Policy', type:'select',
    options:['Aaa','Aa','A','Baa','Ba','B','Caa','Ca'] },
];

/**
 * Weights per Moody’s Alcoholic Beverages scorecard:   [oai_citation:2‡Rating Methodology_ Alcoholic Beverages.pdf](file-service://file-JD8HwXXeUXEP5qanZWTc5U)
 * - Scale 15% → Revenue 15%
 * - Business Profile 32.5% → Diversification/Risk Markets 10%, Brand Strength/Diversification 7.5%,
 *   Global Industry Position 7.5%, Innovation/Distribution/Infrastructure 7.5%
 * - Profitability & Efficiency 7.5% → EBITA Margin 7.5%
 * - Leverage & Coverage 30% → Debt/EBITDA 12.5%, RCF/Net Debt 10%, EBIT/Interest 7.5%
 * - Financial Policy 15%
 */
const W = {
  revenue: 0.15,
  divRisk: 0.10,
  brandStrength: 0.075,
  industryPos: 0.075,
  innovation: 0.075,
  ebitaMargin: 0.075,
  debtEbitda: 0.125,
  rcfNetDebt: 0.10,
  ebitInterest: 0.075,
  financialPolicy: 0.15,
};

/**
 * Linear scoring endpoints (Aaa ↔ Ca) aligned to table anchors.   [oai_citation:3‡Rating Methodology_ Alcoholic Beverages.pdf](file-service://file-JD8HwXXeUXEP5qanZWTc5U)
 * - Revenue: best 40 → worst 0 (USD bn)
 * - EBITA Margin: best 40% → worst 0%
 * - Debt/EBITDA: best 0.5x → worst 12x (lower is better; negative EBITDA ⇒ worst)
 * - RCF/Net Debt: best 70% → worst 0% (special handling when Net Debt < 0)
 * - EBIT/Interest: best 20x → worst 0x
 */
const BANDS = {
  revenue:        { best: 40.0, worst: 0.0,  higherIsBetter: true  },
  ebitaMargin:    { best: 40.0, worst: 0.0,  higherIsBetter: true  },
  debtEbitda:     { best:  0.5, worst:12.0,  higherIsBetter: false },
  rcfNetDebt_pos: { best: 70.0, worst: 0.0,  higherIsBetter: true  },
  ebitInterest:   { best: 20.0, worst: 0.0,  higherIsBetter: true  },
};

// Coverage helper for zero/≤0 interest
function safeCoverage(numer, denom, best, worst){
  if (denom > 0) return numer / denom;
  if (denom === 0) return numer > 0 ? best : worst;
  return numer > 0 ? best : worst;
}

export async function score(inputs){
  // Parse numerics
  const revenue     = Number(inputs.revenue);
  const mEBITA      = Number(inputs.ebitaMargin);
  const debt        = Number(inputs.debt);
  const ebitda      = Number(inputs.ebitda);
  const ebit        = Number(inputs.ebit);
  const interest    = Number(inputs.interest);
  const rcfPct      = Number(inputs.rcf);
  const netDebt     = Number(inputs.netDebt);

  // Debt / EBITDA (handle negative EBITDA)
  let d2e = Infinity;
  if (ebitda > 0) d2e = debt / ebitda;
  else if (ebitda <= 0) d2e = -1; // signal worst in our numeric scale

  // EBIT / Interest
  const ebitInterest = safeCoverage(ebit, interest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst);

  // Quantitative → numeric scores (engine scale)
  const sRev   = interp(revenue,  BANDS.revenue.best,     BANDS.revenue.worst,     BANDS.revenue.higherIsBetter);
  const sMarg  = interp(mEBITA,   BANDS.ebitaMargin.best,  BANDS.ebitaMargin.worst, BANDS.ebitaMargin.higherIsBetter);
  const sLev   = (d2e < 0) ? 20.5 : interp(d2e,           BANDS.debtEbitda.best,   BANDS.debtEbitda.worst,   BANDS.debtEbitda.higherIsBetter);
  const sCov   = interp(ebitInterest, BANDS.ebitInterest.best, BANDS.ebitInterest.worst, BANDS.ebitInterest.higherIsBetter);

  // RCF / Net Debt special cases
  let sRCF;
  if (netDebt < 0) {
    // Net cash: best if RCF>0, worst if RCF≤0 (convention used across our Moody’s modules)
    sRCF = (rcfPct > 0) ? 0.5 : 20.5;
  } else {
    sRCF = interp(rcfPct, BANDS.rcfNetDebt_pos.best, BANDS.rcfNetDebt_pos.worst, BANDS.rcfNetDebt_pos.higherIsBetter);
  }

  // Qualitative → numeric
  const qDivRisk = QUAL_TO_NUM[inputs.diversRisk];
  const qBrand   = QUAL_TO_NUM[inputs.brandStrength];
  const qIndPos  = QUAL_TO_NUM[inputs.industryPos];
  const qInnov   = QUAL_TO_NUM[inputs.innovation];
  const qFP      = QUAL_TO_NUM[inputs.financialPolicy];

  // Aggregate → rating
  const agg =
      sRev    * W.revenue +
      qDivRisk* W.divRisk +
      qBrand  * W.brandStrength +
      qIndPos * W.industryPos +
      qInnov  * W.innovation +
      sMarg   * W.ebitaMargin +
      sLev    * W.debtEbitda +
      sRCF    * W.rcfNetDebt +
      sCov    * W.ebitInterest +
      qFP     * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // Drivers (concise)
  const drivers = [];
  if (d2e >= 4.0) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (ebitInterest <= 3) drivers.push('Weak EBIT/Interest coverage.');
  if (rcfPct <= 5 && netDebt > 0) drivers.push('Low RCF relative to net debt.');
  if (mEBITA >= 25) drivers.push('Strong EBITA margin supports profitability.');
  if (revenue >= 10) drivers.push('Scale supports business strength.');
  if (inputs.brandStrength?.startsWith('A')) drivers.push('Strong brand/category breadth & depth.');
  if (inputs.diversRisk?.startsWith('A')) drivers.push('Highly diversified footprint with limited exposure to riskier markets.');
  if (inputs.industryPos?.startsWith('A')) drivers.push('Leading global industry position.');
  if (inputs.innovation?.startsWith('A')) drivers.push('Robust innovation and advantaged distribution/infrastructure.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Revenue: revenue,
      'EBITA Margin (%)': mEBITA,
      'Debt/EBITDA (x)': (d2e === Infinity) ? Infinity : d2e,
      'RCF/Net Debt (%)': rcfPct,
      'EBIT/Interest (x)': ebitInterest,
    },
    factors: { sRev, sMarg, sLev, sRCF, sCov, qDivRisk, qBrand, qIndPos, qInnov, qFP },
    numeric: agg,
    rating,
    drivers
  };
}

export default { id, fields, score };
