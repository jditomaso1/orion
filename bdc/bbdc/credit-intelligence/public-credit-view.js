(function(){
  const root=document.getElementById('credit-view');
  const slug=document.body.dataset.company;
  const view=document.body.dataset.view||'overview';
  const c=(window.ORION_PUBLIC_CREDITS||[]).find(x=>x.slug===slug);
  if(!root||!c){if(root)root.innerHTML='<div class="panel">Credit data unavailable.</div>';return}
  const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pill=(text,kind='')=>`<span class="pill ${kind}">${esc(text)}</span>`;
  const indicators=c.indicators.map(x=>`<tr><td>${esc(x[0])}</td><td><strong>${esc(x[1])}</strong></td></tr>`).join('');
  const catalysts=c.catalysts.map(x=>`<li>${esc(x)}</li>`).join('');
  const titles={overview:'Credit Overview',monitoring:'Monitoring & 6–12 Month Catalysts',rating:'Shadow Rating & Credit Conclusion',memo:'Investment Memo',financials:'Financial Performance',tear:'Credit Tear Sheet',news:'News & Catalysts',valuation:'Valuation & Recovery',liquidity:'Liquidity & Runway',capital:'Capital Structure',compliance:'Covenants & Compliance',agreement:'Credit Agreement',organization:'Organizational Structure',industry:'Business & Industry',sources:'Source Library',filings:'SEC Filings',projections:'Projections & Scenarios'};
  const title=titles[view]||'Credit Overview';
  root.innerHTML=`
    <div class="eyebrow">ORION · BDC INTELLIGENCE</div>
    <div class="header"><div><h1>${esc(c.company)} · ${title}</h1><p>Public-information assessment · As of July 20, 2026</p></div><div class="pills">${pill(c.direction,c.direction.startsWith('Deteriorating')?'risk':c.direction==='Improving'?'good':'watch')}${pill(c.monitoring,'watch')}</div></div>
    <section class="kpis"><article><label>ORION ACTION</label><b>${esc(c.status)}</b><small>${esc(c.monitoring)}</small></article><article><label>ISSUER / LOAN</label><b>${esc(c.issuerRating)} / ${esc(c.loanRating)}</b><small>Independent Orion assessment</small></article><article><label>BBDC FAIR VALUE</label><b>${esc(c.fairValue)}</b><small>${esc(c.portfolio)} of portfolio</small></article><article><label>MARK / COST</label><b>${esc(c.mark)}</b><small>Cost ${esc(c.cost)}</small></article><article><label>CONFIDENCE</label><b>${esc(c.confidence)}</b><small>Public filings + BBDC SOI</small></article></section>
    <section class="panel conclusion"><label>CURRENT CREDIT CONCLUSION</label><p>${esc(c.conclusion)}</p></section>
    <div class="grid"><section class="panel"><h2>BBDC position</h2><table><tbody><tr><td>Principal</td><td><strong>${esc(c.par)}</strong></td></tr><tr><td>Cost / fair value</td><td><strong>${esc(c.cost)} / ${esc(c.fairValue)}</strong></td></tr><tr><td>Terms</td><td><strong>${esc(c.terms)}</strong></td></tr><tr><td>Portfolio exposure</td><td><strong>${esc(c.portfolio)}</strong></td></tr></tbody></table></section><section class="panel"><h2>Current indicators</h2><table><tbody>${indicators}</tbody></table></section></div>
    <div class="grid"><section class="panel"><h2>6–12 month catalysts</h2><ul>${catalysts}</ul></section><section class="panel riskbox"><h2>Default pathway</h2><p>${esc(c.defaultPath)}</p></section></div>
    <section class="panel"><h2>BBDC downside and recovery context</h2><p>${esc(c.downside)}</p></section>
    <section class="sources"><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(c.sourceLabel)} ↗</a><a href="${esc(c.bbdcUrl)}" target="_blank" rel="noopener">BBDC Q1 2026 Schedule of Investments ↗</a></section>`;
})();
