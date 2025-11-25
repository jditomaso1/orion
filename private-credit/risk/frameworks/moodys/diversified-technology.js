// ratings/frameworks/moodys/diversified-technology.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'moodys/diversified-technology';

/**
 * Fields — user inputs on the left side of the UI
 */
export const fields = [
  { id:'revenue', label:'Revenue (USD, billions)', type:'number', step:'0.1' },
  { id:'ebitMargin', label:'EBIT Margin (%)', type:'number', step:'0.1' },
  { id:'ebitdaInterest', label:'EBITDA / Interest (x)', type:'number', step:'0.1' },
  { id:'fcfDebt', label:'FCF / Debt (%)', type:'number', step:'0.1' },
  { id:'debtEbitda', label:'Debt / EBITDA (x)', type:'number', step:'0.1' },
  { id:'bizProfile', label:'Business Profile', type:'select',
    options:Object.keys(QUAL_TO_NUM) },
  { id:'finPolicy', label:'Financial Policy', type:'select',
    options:Object.keys(QUAL_TO_NUM) },
];

/**
 * Weights from Moody’s methodology
 * Scale 20%, Business Profile 20%, Profitability 10%, Leverage & Coverage 30%, Financial Policy 20%
 */
const W = { revenue:0.20, bizProfile:0.20, ebitMargin:0.10,
            ebitdaInterest:0.10, fcfDebt:0.10, debtEbitda:0.10, finPolicy:0.20 };

/**
 * Linear scoring bands (Aaa to Ca endpoints) from Exhibit 2 & 4 in the PDF
 */
const BANDS = {
  revenue:       { best:100.0, worst:0.0, higherIsBetter:true },     // $100B+ → Aaa, $0 → Ca
  ebitMargin:    { best:70.0,  worst:0.0, higherIsBetter:true },     // 70% → Aaa, 0% → Ca
  ebitdaInterest:{ best:40.0,  worst:0.0, higherIsBetter:true },     // 40x → Aaa, 0x → Ca
  fcfDebt:       { best:60.0,  worst:-10.0,higherIsBetter:true },    // 60% → Aaa, -10% → Ca
  debtEbitda:    { best:0.0,   worst:15.0,higherIsBetter:false }     // 0x → Aaa, 15x+ → Ca
};

/**
 * Score function
 */
export async function score(inputs){
  const sRev  = interp(inputs.revenue,       BANDS.revenue.best,       BANDS.revenue.worst,       BANDS.revenue.higherIsBetter);
  const sEBM  = interp(inputs.ebitMargin,    BANDS.ebitMargin.best,    BANDS.ebitMargin.worst,    BANDS.ebitMargin.higherIsBetter);
  const sCov  = interp(inputs.ebitdaInterest,BANDS.ebitdaInterest.best,BANDS.ebitdaInterest.worst,BANDS.ebitdaInterest.higherIsBetter);
  const sFCF  = interp(inputs.fcfDebt,       BANDS.fcfDebt.best,       BANDS.fcfDebt.worst,       BANDS.fcfDebt.higherIsBetter);
  const sLev  = interp(inputs.debtEbitda,    BANDS.debtEbitda.best,    BANDS.debtEbitda.worst,    BANDS.debtEbitda.higherIsBetter);

  const qBP   = QUAL_TO_NUM[inputs.bizProfile];
  const qFP   = QUAL_TO_NUM[inputs.finPolicy];

  const agg = sRev*W.revenue + qBP*W.bizProfile + sEBM*W.ebitMargin +
              sCov*W.ebitdaInterest + sFCF*W.fcfDebt + sLev*W.debtEbitda +
              qFP*W.finPolicy;

  const rating = mapAggregateToRating(agg);

  return {
    metrics: {
      Revenue:inputs.revenue,
      EBIT_Margin:inputs.ebitMargin,
      EBITDA_Interest:inputs.ebitdaInterest,
      FCF_Debt:inputs.fcfDebt,
      Debt_EBITDA:inputs.debtEbitda
    },
    factors: { sRev, sEBM, sCov, sFCF, sLev, qBP, qFP },
    numeric: agg,
    rating,
    drivers: ['(Placeholder) Replace with exact Moody’s factor mapping & narrative thresholds.']
  };
}

export default { id, fields, score };
