// Lightweight S&P mapping & PD helper used by S&P modules

// Map normalized 0..1 aggregate to S&P-like letter bands.
// Tune thresholds later as you calibrate.
export function spMapScoreToLetter(x){
  if (!Number.isFinite(x)) return '—';
  // Example bands roughly centered on single-B world
  return (
    x >= 0.90 ? 'BBB+' :
    x >= 0.85 ? 'BBB'  :
    x >= 0.80 ? 'BBB-' :
    x >= 0.75 ? 'BB+'  :
    x >= 0.70 ? 'BB'   :
    x >= 0.65 ? 'BB-'  :
    x >= 0.60 ? 'B+'   :
    x >= 0.55 ? 'B'    :
    x >= 0.50 ? 'B-'   :
    x >= 0.45 ? 'CCC+' :
    x >= 0.40 ? 'CCC'  :
                'CCC-'
  );
}

// Simple PD hint string by rating bucket (placeholder; refine when you have data)
export function spPDHint(letter){
  const map = {
    'BBB+':'≈0.5–0.8% PD','BBB':'≈0.8–1.2%','BBB-':'≈1.2–1.8%',
    'BB+':'≈1.8–2.6%','BB':'≈2.6–3.8%','BB-':'≈3.8–5.5%',
    'B+':'≈5.5–7.5%','B':'≈7.5–10%','B-':'≈10–14%',
    'CCC+':'≈14–22%','CCC':'≈22–30%','CCC-':'≈30%+'
  };
  return map[letter] ? `PD overlay: ${map[letter]}` : '';
}
