
// ratings/frameworks/moodys/building-materials.js
// Shadow Ratings — Moody’s sector module: Building Materials
// Factors/weights reflect Moody’s published scorecard structure for this sector.
// Source notes: factor set & descriptions from the methodology scorecard and factor write-ups.  [oai_citation:2‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)  [oai_citation:3‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)

import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/building-materials';

// Field schema used by the UI form
export const fields = [
  // SCALE
  { id:'revenue', label:'Revenue (USD, billions)', step:'0.01' },

  // BUSINESS PROFILE (qualitative, 0–1 via QUAL_TO_NUM)
  { id:'businessProfile', label:'Business Profile', type:'select',
    options:Object.keys(QUAL_TO_NUM) }, // captures mix/diversification/price pass-through, etc.  [oai_citation:4‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)

  // PROFITABILITY & EFFICIENCY
  { id:'operMargin', label:'Operating Margin (%)', step:'0.1' },
  { id:'opMarginStability', label:'Operating Margin Stability', type:'select',
    options:Object.keys(QUAL_TO_NUM) }, // qualitative stability across cycles, end-market mix, pass-through ability.  [oai_citation:5‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  { id:'ebit', label:'EBIT (USD, billions)', step:'0.01' },
  { id:'avgAssets', label:'Average Assets (USD, billions, 2-yr avg)', step:'0.01' }, // EBIT/Avg Assets subfactor.  [oai_citation:6‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)

  // LEVERAGE & COVERAGE
  { id:'debt', label:'Total Debt (USD, billions)', step:'0.01' },
  { id:'bookCap', label:'Book Capitalization (Debt + Equity, USD, billions)', step:'0.01' }, // Debt/Book Cap.  [oai_citation:7‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  { id:'ebitda', label:'EBITDA (USD, billions)', step:'0.01' },                               // Debt/EBITDA.  [oai_citation:8‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  { id:'interest', label:'Interest Expense (USD, billions)', step:'0.001' },                  // EBIT/Interest.  [oai_citation:9‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  { id:'rcf', label:'Retained Cash Flow (RCF, USD, billions)', step:'0.01' },
  { id:'netDebt', label:'Net Debt (USD, billions)', step:'0.01' },                            // RCF/Net Debt.  [oai_citation:10‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)

  // FINANCIAL POLICY (qualitative)
  { id:'finPolicy', label:'Financial Policy', type:'select',
    options:Object.keys(QUAL_TO_NUM) } // conservative ↔ aggressive.  [oai_citation:11‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
];

// Moody’s factor weights for the sector (total = 1.00)
const W = {
  // top-level
  scale: 0.10,
  businessProfile: 0.15,
  profitabilityEfficiency: 0.20,
  leverageCoverage: 0.40,
  financialPolicy: 0.15,

  // within Profitability & Efficiency (20%)
  operMargin: 0.05,            // Operating Margin
  opMarginStability: 0.10,     // Operating Margin Stability (qual)
  ebitToAssets: 0.05,          // EBIT / Average Assets

  // within Leverage & Coverage (40%)
  debtToBookCap: 0.10,
  debtToEbitda: 0.10,
  ebitToInterest: 0.10,
  rcfToNetDebt: 0.10
};

// Interp bands (best ↔ worst). Endpoints reflect the Aaa↔Ca directionality in the scorecard.
// Tune as we pull more granular thresholds from the PDF appendix.
const BANDS = {
  revenue:          { best: 50,  worst: 0.04, higherIsBetter: true },   // ≥$50B at Aaa scale.  [oai_citation:12‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  operMarginPct:    { best: 40,  worst: 0,    higherIsBetter: true },   // Operating margin.  [oai_citation:13‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  ebitToAssetsPct:  { best: 25,  worst: 0,    higherIsBetter: true },   // EBIT/Average Assets (proxy endpoints).
  debtToBookCapPct: { best: 20,  worst: 110,  higherIsBetter: false },  // Lower is better.
  debtToEbitdaX:    { best: 0.5, worst: 9.0,  higherIsBetter: false },  // Lower is better.
  ebitToInterestX:  { best: 20,  worst: 0.5,  higherIsBetter: true },   // Higher is better.
  rcfToNetDebtPct:  { best: 70,  worst: -5,   higherIsBetter: true }    // Higher is better.
};

// Helper: safe division
function safeDiv(num, den){
  if (den === 0 || !isFinite(num) || !isFinite(den)) return null;
  return num / den;
}

export async function score(inputs){
  // === Derived metrics ===
  const ebitToAssets = (inputs.ebit!=null && inputs.avgAssets>0) ? safeDiv(inputs.ebit, inputs.avgAssets) : null;
  const debtToBookCap = (inputs.debt!=null && inputs.bookCap>0) ? (inputs.debt / inputs.bookCap) : null;
  const debtToEbitda = (inputs.ebitda>0) ? (inputs.debt / inputs.ebitda) : (inputs.debt>0 ? Infinity : 0);
  const ebitToInterest = (inputs.interest>0 && inputs.ebit!=null) ? (inputs.ebit / inputs.interest)
                           : (inputs.ebit>0 ? BANDS.ebitToInterestX.best : BANDS.ebitToInterestX.worst);
  const rcfToNetDebt = (inputs.netDebt>0 && inputs.rcf!=null) ? (inputs.rcf / inputs.netDebt) : null;

  // === Normalize → 0..1 using interp() (best→1, worst→0 by our engine’s convention) ===
  const sScale  = interp(inputs.revenue,        BANDS.revenue.best,          BANDS.revenue.worst,          BANDS.revenue.higherIsBetter);
  const sOM     = interp(inputs.operMargin,     BANDS.operMarginPct.best,    BANDS.operMarginPct.worst,    BANDS.operMarginPct.higherIsBetter);
  const sEA     = interp(ebitToAssets!=null? ebitToAssets*100 : null, BANDS.ebitToAssetsPct.best,  BANDS.ebitToAssetsPct.worst,  BANDS.ebitToAssetsPct.higherIsBetter);
  const sDBC    = interp(debtToBookCap!=null? debtToBookCap*100 : null, BANDS.debtToBookCapPct.best, BANDS.debtToBookCapPct.worst, BANDS.debtToBookCapPct.higherIsBetter);
  const sDE     = interp(isFinite(debtToEbitda)? debtToEbitda : null,  BANDS.debtToEbitdaX.best,   BANDS.debtToEbitdaX.worst,   BANDS.debtToEbitdaX.higherIsBetter);
  const sEI     = interp(ebitToInterest,        BANDS.ebitToInterestX.best,  BANDS.ebitToInterestX.worst,  BANDS.ebitToInterestX.higherIsBetter);
  const sRCF    = interp(rcfToNetDebt!=null? rcfToNetDebt*100 : null, BANDS.rcfToNetDebtPct.best,  BANDS.rcfToNetDebtPct.worst, BANDS.rcfToNetDebtPct.higherIsBetter);

  // Qualitative → numeric (0..1) via engine’s QUAL_TO_NUM
  const qBP  = QUAL_TO_NUM[inputs.businessProfile];   // business mix, price pass-through, diversification.  [oai_citation:14‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  const qStab= QUAL_TO_NUM[inputs.opMarginStability]; // qualitative stability.  [oai_citation:15‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)
  const qFP  = QUAL_TO_NUM[inputs.finPolicy];         // financial policy.  [oai_citation:16‡Rating Methodology_ Building Materials.pdf](file-service://file-EewTeYuhVC7sMfpqXX1BEU)

  // Aggregate (weighted)
  const profitEff =
      sOM*W.operMargin +
      qStab*W.opMarginStability +
      sEA*W.ebitToAssets;

  const levCov =
      sDBC*W.debtToBookCap +
      sDE*W.debtToEbitda +
      sEI*W.ebitToInterest +
      sRCF*W.rcfToNetDebt;

  const agg =
      sScale*W.scale +
      qBP*W.businessProfile +
      profitEff +
      levCov +
      qFP*W.finPolicy;

  const rating = mapAggregateToRating(agg);

  return {
    metrics: {
      RevenueUSD_B: inputs.revenue,
      OperMarginPct: inputs.operMargin,
      EBITtoAssetsPct: ebitToAssets!=null? ebitToAssets*100 : null,
      DebtToBookCapPct: debtToBookCap!=null? debtToBookCap*100 : null,
      DebtToEBITDAx: isFinite(debtToEbitda)? debtToEbitda : null,
      EBITToInterestx: ebitToInterest,
      RCFToNetDebtPct: rcfToNetDebt!=null? rcfToNetDebt*100 : null
    },
    factors: {
      sScale, qBP, sOM, qStab, sEA, sDBC, sDE, sEI, sRCF
    },
    numeric: agg,
    rating,
    drivers: [
      'Weights mirror Moody’s sector scorecard (Scale 10%; Business Profile 15%; Profitability & Efficiency 20%; Leverage & Coverage 40%; Financial Policy 15%).',
      'Subfactors per methodology: Revenue; Business Profile; Operating Margin; Operating Margin Stability (qual); EBIT/Average Assets; Debt/Book Cap; Debt/EBITDA; EBIT/Interest; RCF/Net Debt; Financial Policy (qual).',
      'Thresholds/bands initialized from the published structure; adjust endpoints as we extract all Aaa↔Ca cutoffs.'
    ]
  };
}

export default { id, fields, score };
