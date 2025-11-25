// ratings/frameworks/sp/media.js
import { QUAL_TO_NUM, interp, mapAggregateToRating } from '../../js/engine.js';

export const id = 'sp/media';

export const fields = [
  { id:'segment', label:'Segment', type:'select',
    options:['Broadcasters','Cable Networks','Outdoor/Other','Publishers'] },
  { id:'revenue',  label:'Revenue (USD, billions)', step:'0.01' },
  { id:'debt',     label:'Total Debt (USD, billions)', step:'0.01' },
  { id:'ebitda',   label:'EBITDA (USD, billions)', step:'0.01' },
  { id:'capex',    label:'Capex (USD, billions)', step:'0.01' },
  { id:'interest', label:'Interest Expense (USD, billions)', step:'0.001' },
  { id:'marketPosition', label:'Market Position', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'trajectory',     label:'Market Share Trajectory', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'bizModel',       label:'Business Model', type:'select', options:Object.keys(QUAL_TO_NUM) },
  { id:'finPolicy',      label:'Financial Policy', type:'select', options:Object.keys(QUAL_TO_NUM) },
];

// TODO: Replace with S&P’s actual factor set, weights, and bands from the doc you’ll provide.
const W = { scale:.15, marketPosition:.10, trajectory:.10, bizModel:.10, leverage:.25, coverage:.20, finPolicy:.10 };
const BANDS = {
  revenue:  { best:60.0, worst:0.04, higherIsBetter:true },
  leverage: { best:0.0,  worst:15.0, higherIsBetter:false },
  coverage: { best:40.0, worst:-1.0, higherIsBetter:true }
};

export async function score(inputs){
  const leverage = (inputs.ebitda > 0) ? (inputs.debt / inputs.ebitda) : Infinity;
  const coverage = (inputs.interest > 0) ? ((inputs.ebitda - inputs.capex) / inputs.interest)
                                         : ((inputs.ebitda - inputs.capex) > 0 ? BANDS.coverage.best : BANDS.coverage.worst);

  const sRev = interp(inputs.revenue,  BANDS.revenue.best,  BANDS.revenue.worst,  BANDS.revenue.higherIsBetter);
  const sLev = interp(leverage,        BANDS.leverage.best, BANDS.leverage.worst, BANDS.leverage.higherIsBetter);
  const sCov = interp(coverage,        BANDS.coverage.best, BANDS.coverage.worst, BANDS.coverage.higherIsBetter);

  const qMP  = QUAL_TO_NUM[inputs.marketPosition];
  const qTra = QUAL_TO_NUM[inputs.trajectory];
  const qBM  = QUAL_TO_NUM[inputs.bizModel];
  const qFP  = QUAL_TO_NUM[inputs.finPolicy];

  const agg = sRev*W.scale + qMP*W.marketPosition + qTra*W.trajectory + qBM*W.bizModel + sLev*W.leverage + sCov*W.coverage + qFP*W.finPolicy;
  const rating = mapAggregateToRating(agg);

  return {
    metrics: { Revenue:inputs.revenue, Leverage:leverage, Coverage:coverage },
    factors: { sRev, sLev, sCov, qMP, qTra, qBM, qFP },
    numeric: agg,
    rating,
    drivers: ['(Placeholder) Replace bands & weights with S&P methodology values.']
  };
}

export default { id, fields, score };
