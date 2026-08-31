(function(){
  const palette=['#f2a000','#18c26e','#5ecbff','#ffe100','#ff5050','#2878ff','#b67cff','#91a3b0','#f46fba','#c4ff4d'];
  const colorMap=new Map([
    ['#187aba','#f2a000'],['#1f83bd','#f2a000'],['#063b66','#5ecbff'],['#06345b','#5ecbff'],
    ['#002b51','#5ecbff'],['#3eb661','#18c26e'],['#3bb96b','#18c26e'],['#f59e0b','#ffe100'],
    ['#d97706','#ffe100'],['#dc2626','#ff5050'],['#dc3545','#ff5050'],['#d64545','#ff5050'],
    ['#8b72cf','#b67cff'],['#64748b','#91a3b0'],['#edf2f7','#262626'],['#e8eef3','#262626']
  ]);
  function terminalColor(value,index=0){
    if(Array.isArray(value))return value.map((item,i)=>terminalColor(item,i));
    if(typeof value!=='string')return value;
    const lower=value.toLowerCase();
    if(colorMap.has(lower))return colorMap.get(lower);
    if(lower.startsWith('rgba(24,122,186'))return 'rgba(242,160,0,.16)';
    if(lower.startsWith('rgba(31,131,189'))return 'rgba(242,160,0,.16)';
    if(lower.startsWith('rgba(59,185,107'))return 'rgba(24,194,110,.16)';
    return value||palette[index%palette.length];
  }
  function themeChart(chart){
    const options=chart.options||(chart.options={});
    const plugins=options.plugins||(options.plugins={});
    const legend=plugins.legend||(plugins.legend={});
    const labels=legend.labels||(legend.labels={});
    labels.color='#aaa';labels.font={...(labels.font||{}),family:'IBM Plex Mono',size:9};labels.boxWidth=9;labels.boxHeight=9;
    const tooltip=plugins.tooltip||(plugins.tooltip={});
    Object.assign(tooltip,{backgroundColor:'#151515',borderColor:'#555',borderWidth:1,titleColor:'#f2a000',bodyColor:'#fff'});
    const scales=options.scales||{};
    Object.values(scales).forEach(scale=>{
      scale.border={...(scale.border||{}),color:'#444'};
      scale.grid={...(scale.grid||{}),color:scale.grid?.display===false?'rgba(0,0,0,0)':'#262626'};
      scale.ticks={...(scale.ticks||{}),color:'#999',font:{...(scale.ticks?.font||{}),family:'IBM Plex Mono',size:9}};
      if(scale.title)scale.title={...scale.title,color:'#777',font:{...(scale.title.font||{}),family:'IBM Plex Mono',size:9,weight:'600'}};
    });
    (chart.data?.datasets||[]).forEach((dataset,index)=>{
      if(dataset.borderColor!=null)dataset.borderColor=terminalColor(dataset.borderColor,index);
      if(dataset.backgroundColor!=null)dataset.backgroundColor=terminalColor(dataset.backgroundColor,index);
      if(dataset.pointBackgroundColor!=null)dataset.pointBackgroundColor=terminalColor(dataset.pointBackgroundColor,index);
      if(typeof dataset.borderRadius==='number')dataset.borderRadius=0;
    });
  }
  if(window.Chart){
    Chart.defaults.color='#999';Chart.defaults.borderColor='#2b2b2b';Chart.defaults.font.family='IBM Plex Mono';Chart.defaults.font.size=9;
    Chart.register({id:'orionBloombergTheme',beforeInit:themeChart});
  }

  const pageCodes={
    'overview':'OV','financials':'FA','comparables':'RV','news':'CN','daily-brief':'DB','ask-orion':'AO',
    'summary':'PS','positions':'POS','construction':'PC','raroc':'RR','quality':'PQ','activity':'PA','trends':'TR','neural-network':'NN',
    'index':'CD','portfolio-companies':'CO','credit-watchlist':'WL','shadow-ratings':'SR','monitoring-alerts':'AL',
    'industry':'BI','liquidity':'LQ','projections':'PR','capital-structure':'CS','organizational-structure':'OS',
    'valuation':'VL','credit-agreement':'CA','compliance':'CP','shadow-rating':'RT','monitoring':'MN','sec-filings':'SF',
    'sources':'SO','investment-memo':'IM','tear-sheet':'TS'
  };
  const baseName=(location.pathname.split('/').pop()||'index.html').replace(/-bloomberg(?=\.html$)/,'').replace(/\.html$/,'');
  const code=pageCodes[baseName]||'AN';
  const original=document.body?.dataset.bbOriginal||location.pathname.replace(/-bloomberg(?=\.html$)/,'');
  let clockTimer;
  function now(){
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/Puerto_Rico',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())+' AST';
  }
  function injectRibbon(){
    if(document.querySelector('.bb-terminal-ribbon'))return;
    const ribbon=document.createElement('div');ribbon.className='bb-terminal-ribbon';
    ribbon.innerHTML=`<div class="bb-ribbon-left"><span class="bb-ribbon-security">BBDC US EQUITY</span><span class="bb-ribbon-code">${code}</span><span class="bb-ribbon-title">ORION PRIVATE CREDIT / TERMINAL WORKSPACE</span></div><div class="bb-ribbon-right"><span class="bb-ribbon-live">● ONLINE</span><span class="bb-ribbon-clock">${now()}</span><a class="bb-ribbon-classic" href="${original}">CLASSIC ↗</a></div>`;
    document.body.appendChild(ribbon);
    const clock=ribbon.querySelector('.bb-ribbon-clock');clockTimer=setInterval(()=>{clock.textContent=now()},1000);
  }
  function injectStamp(){
    const main=document.querySelector('main');if(!main||main.querySelector('.bb-page-stamp'))return;
    const stamp=document.createElement('div');stamp.className='bb-page-stamp';stamp.innerHTML=`${code} // TERMINAL VIEW <span>LIVE BBDC DATA</span>`;
    const heading=main.querySelector('.eyebrow,h1,.page-title');
    if(heading?.parentElement)heading.parentElement.insertBefore(stamp,heading);else main.prepend(stamp);
  }
  function markActive(sidebar){
    const current=location.pathname;
    sidebar.querySelectorAll('a[href]').forEach(link=>{
      let path;try{path=new URL(link.href,location.origin).pathname}catch(e){return}
      const active=path===current;if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');if(active){
        let parent=link.parentElement;
        while(parent&&parent!==sidebar){if(parent.classList?.contains('bb-nav-list')){parent.classList.remove('is-collapsed');const trigger=sidebar.querySelector(`[data-bb-target="${parent.id}"]`);if(trigger){trigger.setAttribute('aria-expanded','true');const caret=trigger.querySelector('.bb-caret');if(caret)caret.style.transform='rotate(0deg)'}}parent=parent.parentElement}
      }
    });
    const classic=sidebar.querySelector('#bb-classic-link');if(classic)classic.href=original;
  }
  function setupSidebar(sidebar){
    if(!sidebar||sidebar.dataset.bbReady)return;sidebar.dataset.bbReady='true';
    let saved={};try{saved=JSON.parse(localStorage.getItem('bbdc-bloomberg-sidebar')||'{}')}catch(e){}
    let legacyOpen=[];try{legacyOpen=JSON.parse(localStorage.getItem('bbdc-sidebar-sections')||'[]')}catch(e){}
    sidebar.querySelectorAll('[data-bb-target]').forEach(button=>{
      const target=document.getElementById(button.dataset.bbTarget);if(!target)return;
      const targetId=button.dataset.bbTarget,legacyManaged=target.classList.contains('hidden')||legacyOpen.includes(targetId);
      if(legacyManaged)target.classList.toggle('is-collapsed',!legacyOpen.includes(targetId));
      target.classList.remove('hidden');
      if(typeof saved[targetId]==='boolean')target.classList.toggle('is-collapsed',!saved[targetId]);
      const sync=()=>{const collapsed=target.classList.contains('is-collapsed');button.setAttribute('aria-expanded',String(!collapsed));const caret=button.querySelector('.bb-caret');if(caret)caret.style.transform=collapsed?'rotate(-90deg)':'rotate(0deg)'};
      sync();button.addEventListener('click',event=>{event.preventDefault();target.classList.toggle('is-collapsed');saved[targetId]=!target.classList.contains('is-collapsed');localStorage.setItem('bbdc-bloomberg-sidebar',JSON.stringify(saved));sync()});
    });
    markActive(sidebar);
  }
  async function ensureSidebar(){
    const host=document.querySelector('#sidebar-placeholder,#sidebar');
    if(!host||host.querySelector('.bb-sidebar')||host.dataset.bbLoading)return;
    host.dataset.bbLoading='true';
    try{
      const response=await fetch('/bdc/bbdc/sidebar-bloomberg.html?v=20260831-nav-hierarchy',{cache:'no-store'});
      if(!response.ok)throw new Error(String(response.status));
      host.innerHTML=await response.text();scan();
    }catch(error){console.warn('Terminal navigation unavailable',error)}
    finally{delete host.dataset.bbLoading}
  }
  function scan(){document.querySelectorAll('.bb-sidebar').forEach(setupSidebar)}
  function init(){injectRibbon();injectStamp();scan();ensureSidebar();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('pagehide',()=>clearInterval(clockTimer),{once:true});
})();
