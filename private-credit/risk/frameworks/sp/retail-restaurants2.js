// ratings/frameworks/sp/retail-restaurants.js
// Shadow Ratings — S&P-style scorecard: Retail & Restaurants (based on KCF; superseded by 2024 umbrella, but useful for factors/bands)
// Uses your shared engine helpers: QUAL_TO_NUM (Aaa..Ca → 0..1), interp(), mapAggregateToRating()

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'sp/retail-restaurants';

/**
 * Notes for users:
 * - Segment drives the EBITDA margin banding (Dept/Specialty vs Discounters/Food/Drug vs Restaurants vs Auto Retailers).
 * - We mirror S&P KCF structure: Business Risk (competitive advantage, scale/scope/diversity, operating efficiency/profitability),
 *   Financial Risk (leverage, coverage, cash flow to debt), plus Financial Policy.
 * - Weights are pragmatic and documented with TODO flags where you later want to align to live S&P tables.
 */

// === Inputs shown in the UI ===
export const fields = [
  // 1) Segment selection (sets profitability margin bands)
  { id:'segment', label:'Segment', type:'select',
    options:[
      'Dept/Specialty Retailers',
      'Discounters/Food/Drug/C-Stores',
      'Restaurants',
      'Auto Retailers'
    ]},

  // 2) Scale
  { id:'revenue',  label:'Revenue (USD, billions)', type:'number', step:'0.01' },

  // 3) Profitability (quant)
  { id:'ebitdaMargin', label:'EBITDA Margin (%)', type:'number', step:'0.1' },

  // 4) Financial risk (leverage / coverage / cash flow)
  { id:'debt',     label:'Total Debt (USD, billions)',       type:'number', step:'0.01' },
  { id:'ebitda',   label:'EBITDA (USD, billions)',           type:'number', step:'0.01' },
  { id:'interest', label:'Cash Interest (USD, billions)',    type:'number', step:'0.001', placeholder:'Exclude lease addbacks if possible' },
  { id:'cfToDebtPct', label:'Cash Flow to Debt (%)',         type:'number', step:'0.1', placeholder:'FOCF/Debt or DCF/Debt or CFO/Debt' },

  // 5) Qualitative KCF components (mapped via QUAL_TO_NUM Aaa..Ca for consistency with your engine)
  { id:'compAdvantage', label:'Competitive Advantage', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'scaleScope',    label:'Scale / Scope / Diversity', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'opEfficiency',  label:'Operating Efficiency (qual)', type:'select', options:Object.keys(QUAL_TO_NUM) },

  // 6) Policy
  { id:'financialPolicy', label:'Financial Policy', type:'select', options:Object.keys(QUAL_TO_NUM) },
];

// === Weights (transparent & tweakable) ===
// Business Risk ≈ 50% (KCF emphasis on Competitive Advantage, Scale/Scope/Diversity, Operating Efficiency/Profitability)
// Financial Risk ≈ 40% (Leverage, Coverage, Cash Flow to Debt)
// Financial Policy 10%
// TODO: If you get live S&P tables, swap these to exact weights.
const W = {
  // Business risk (50%)
  scale:            0.10, // revenue (scale)
  compAdvantage:    0.18,
  scaleScope:       0.12,
  opEff_qual:       0.07,
  profitabilityPct: 0.03, // EBITDA margin (quant)

  // Financial risk (40%)
  leverage:         0.18, // Debt / EBITDA
  coverage:         0.12, // EBITDA / Interest
  cashFlowToDebt:   0.10, // FOCF/DCF/CFO to Debt (%)

  // Policy (10%)
  financialPolicy:  0.10,
};

// === Numerical bands (Aaa↔Ca directionality) ===
// Scale:
const BANDS = {
  revenue:      { best: 60.0, worst: 0.02, higherIsBetter: true }, // $60bn+ best; tiny scale worst
  d2e:          { best: 0.0,  worst: 8.0,  higherIsBetter: false }, // Debt/EBITDA (lower better)
  cov:          { best: 20.0, worst: 0.0,  higherIsBetter: true },  // EBITDA/Interest (x)
  cfToDebt:     { best: 30.0, worst: -5.0, higherIsBetter: true },  // Cash flow to debt (%)
};

// Segment-specific EBITDA margin endpoints (continuous interpolation around S&P KCF “above/avg/below” guide)
// You can tune these later; the “best” is comfortably above the “above average” cut, and “worst” below the “below average” cut.
const MARGIN_BANDS = {
  'Dept/Specialty Retailers':      { best: 22, worst: 5 },   // KCF: above avg >16%, avg 10–16, below <10
  'Discounters/Food/Drug/C-Stores':{ best: 14, worst: 2 },   // KCF: above >10, avg 5–10, below <5
  'Restaurants':                   { best: 28, worst: 8 },   // KCF: above >23, avg 14–23, below <14
  'Auto Retailers':                { best: 6,  worst: 2 },   // KCF: above >4,  avg 3.5–4, below <3.5
};

// Helper for coverage when interest is zero/near-zero
function safeCoverage(ebitda, interest, best, worst){
  if (interest > 0) return ebitda / interest;
  if (interest === 0) return ebitda > 0 ? best : worst;
  // negative interest shouldn’t occur; treat like zero
  return ebitda > 0 ? best : worst;
}

export async function score(inputs){
  const seg = inputs.segment || 'Dept/Specialty Retailers';

  // 1) Derived metrics
  const revenue = Number(inputs.revenue);
  const ebitda  = Number(inputs.ebitda);
  const debt    = Number(inputs.debt);
  const interest= Number(inputs.interest);
  const mEBITDA = Number(inputs.ebitdaMargin);
  const cfPct   = Number(inputs.cfToDebtPct);

  const d2e = (ebitda > 0) ? (debt / ebitda) : (debt > 0 ? Infinity : 0);
  const cov = safeCoverage(ebitda, interest, BANDS.cov.best, BANDS.cov.worst);

  // 2) Normalize quantitative subfactors
  const sScale   = interp(revenue, BANDS.revenue.best, BANDS.revenue.worst, BANDS.revenue.higherIsBetter);
  const sLev     = interp(isFinite(d2e) ? d2e : null, BANDS.d2e.best, BANDS.d2e.worst, BANDS.d2e.higherIsBetter);
  const sCov     = interp(cov, BANDS.cov.best, BANDS.cov.worst, BANDS.cov.higherIsBetter);
  const sCF      = interp(Number.isFinite(cfPct) ? cfPct : null, BANDS.cfToDebt.best, BANDS.cfToDebt.worst, BANDS.cfToDebt.higherIsBetter);

  const mb = MARGIN_BANDS[seg] || MARGIN_BANDS['Dept/Specialty Retailers'];
  const sMargin = interp(Number.isFinite(mEBITDA) ? mEBITDA : null, mb.best, mb.worst, true);

  // 3) Qualitative → numeric
  const qCA  = QUAL_TO_NUM[inputs.compAdvantage];
  const qSSD = QUAL_TO_NUM[inputs.scaleScope];
  const qOE  = QUAL_TO_NUM[inputs.opEfficiency];
  const qFP  = QUAL_TO_NUM[inputs.financialPolicy];

  // 4) Aggregate
  const agg =
      sScale   * W.scale +
      qCA      * W.compAdvantage +
      qSSD     * W.scaleScope +
      qOE      * W.opEff_qual +
      sMargin  * W.profitabilityPct +
      sLev     * W.leverage +
      sCov     * W.coverage +
      sCF      * W.cashFlowToDebt +
      qFP      * W.financialPolicy;

  const rating = mapAggregateToRating(agg);

  // 5) Diagnostics / drivers
  const drivers = [];
  if (d2e >= 4.5) drivers.push('Elevated leverage (Debt/EBITDA).');
  if (cov <= 3)   drivers.push('Weak interest coverage (EBITDA/Interest).');
  if (cfPct <= 0) drivers.push('Weak cash flow to debt (FOCF/DCF/CFO).');
  if (mEBITDA >= (mb.best - (mb.best-mb.worst)*0.25)) drivers.push('Strong EBITDA margin vs segment peers.');
  if (revenue >= 10) drivers.push('Scale supports purchasing power and cost leverage.');
  if (inputs.compAdvantage?.startsWith('A')) drivers.push('Solid competitive advantage.');
  if (inputs.scaleScope?.startsWith('A'))    drivers.push('Broad scale/scope and diversification.');
  if (inputs.opEfficiency?.startsWith('A'))  drivers.push('Strong operating efficiency.');
  if (inputs.financialPolicy?.startsWith('A')) drivers.push('Conservative financial policy.');

  return {
    metrics: {
      Segment: seg,
      RevenueUSD_B: revenue,
      'EBITDA Margin (%)': mEBITDA,
      'Debt/EBITDA (x)': isFinite(d2e) ? d2e : Infinity,
      'EBITDA/Interest (x)': cov,
      'Cash Flow to Debt (%)': Number.isFinite(cfPct) ? cfPct : null,
    },
    factors: { sScale, qCA, qSSD, qOE, sMargin, sLev, sCov, sCF, qFP },
    numeric: agg,
    rating,
    drivers,
    notes: [
      'S&P KCF factors reflected; exact live weights/bands can be swapped in later if you obtain RatingsDirect tables.',
      'EBITDA margin bands adapt to segment per KCF (Dept/Specialty, Discounters/Food/Drug, Restaurants, Auto Retailers).',
      'Cash Flow to Debt accepts FOCF/Debt, DCF/Debt, or CFO/Debt depending on your data source.'
    ]
  };
}

export default { id, fields, score };
