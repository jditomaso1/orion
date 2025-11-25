// Shared helpers used by your framework/industry modules.

export const QUAL_TO_NUM = { Aaa:1, Aa:3, A:6, Baa:9, Ba:12, B:15, Caa:18, Ca:20 };

export function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

// Linear interpolation for quantitative metrics -> numeric (0.5 .. 20.5)
export function interp(value, best, worst, higherIsBetter = true){
  if (!isFinite(value)) return 20.5;
  const a = higherIsBetter ? best  : worst;
  const b = higherIsBetter ? worst : best;
  const t = clamp((value - a) / (b - a), 0, 1);
  return 0.5 + t * (20.5 - 0.5);
}

// Moody’s-style aggregate mapping (works as placeholder for S&P stub too)
// Guard against bad inputs
export function mapAggregateToRating(x){
  if (!Number.isFinite(x)) return '—';     // <— add this
  const bands = [
    {max:1.5, r:'Aaa'},
    {max:2.5, r:'Aa1'},{max:3.5, r:'Aa2'},{max:4.5, r:'Aa3'},
    {max:5.5, r:'A1'},{max:6.5, r:'A2'},{max:7.5, r:'A3'},
    {max:8.5, r:'Baa1'},{max:9.5, r:'Baa2'},{max:10.5,r:'Baa3'},
    {max:11.5,r:'Ba1'},{max:12.5,r:'Ba2'},{max:13.5,r:'Ba3'},
    {max:14.5,r:'B1'},{max:15.5,r:'B2'},{max:16.5,r:'B3'},
    {max:17.5,r:'Caa1'},{max:18.5,r:'Caa2'},{max:19.5,r:'Caa3'},
    {max:20.5,r:'Ca'}
  ];
  for (const b of bands){ if (x <= b.max) return b.r; }
  return 'C';
}
