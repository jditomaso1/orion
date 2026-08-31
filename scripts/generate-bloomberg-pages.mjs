import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const bbdcRoot='bdc/bbdc';
const companyTabs=[
  'index.html','industry.html','financials.html','liquidity.html','projections.html','capital-structure.html',
  'organizational-structure.html','valuation.html','credit-agreement.html','compliance.html','shadow-rating.html',
  'monitoring.html','news.html','sec-filings.html','sources.html','investment-memo.html','tear-sheet.html'
];
const companyTabMeta={
  'index.html':['OV','Credit Overview'],'industry.html':['BI','Industry'],'financials.html':['FA','Financials'],
  'liquidity.html':['LQ','Liquidity'],'projections.html':['PR','Projections'],'capital-structure.html':['CS','Capital Structure'],
  'organizational-structure.html':['OS','Org Structure'],'valuation.html':['VL','Valuation'],'credit-agreement.html':['CA','Credit Agreement'],
  'compliance.html':['CP','Compliance'],'shadow-rating.html':['RT','Shadow Rating'],'monitoring.html':['MN','Alerts'],
  'news.html':['CN','News'],'sec-filings.html':['SF','SEC Filings'],'sources.html':['SO','Sources'],
  'investment-memo.html':['IM','Investment Memo'],'tear-sheet.html':['TS','Tear Sheet']
};
const companyMeta={
  'coherus-oncology':['CHRS','Coherus Oncology'],'ocular-therapeutix':['OCUL','Ocular Therapeutix'],'herbalife':['HLF','Herbalife']
};
const companies=['coherus-oncology','ocular-therapeutix','herbalife'];
const routes=[
  `${bbdcRoot}/index.html`,
  `${bbdcRoot}/briefing/daily-brief.html`,`${bbdcRoot}/briefing/ask-orion.html`,
  `${bbdcRoot}/overview/overview.html`,`${bbdcRoot}/overview/financials.html`,`${bbdcRoot}/overview/comparables.html`,`${bbdcRoot}/overview/news.html`,
  `${bbdcRoot}/portfolio/summary/summary.html`,`${bbdcRoot}/portfolio/positions/positions.html`,
  `${bbdcRoot}/portfolio/construction/construction.html`,`${bbdcRoot}/portfolio/raroc/raroc.html`,
  `${bbdcRoot}/portfolio/quality/quality.html`,`${bbdcRoot}/portfolio/activity/activity.html`,
  `${bbdcRoot}/portfolio/trends/trends.html`,`${bbdcRoot}/portfolio/neural-network/neural-network.html`,
  `${bbdcRoot}/credit-intelligence/index.html`,`${bbdcRoot}/credit-intelligence/portfolio-companies.html`,
  `${bbdcRoot}/credit-intelligence/credit-watchlist.html`,`${bbdcRoot}/credit-intelligence/shadow-ratings.html`,
  `${bbdcRoot}/credit-intelligence/monitoring-alerts.html`,
  ...companies.flatMap(company=>companyTabs.map(file=>`${bbdcRoot}/credit-intelligence/companies/${company}/${file}`))
];

const altPath=original=>original.replace(/\.html$/, '-bloomberg.html');
const routeMap=new Map(routes.map(original=>[original,altPath(original)]));
const customPage=`${bbdcRoot}/overview/overview.html`;
const terminalVersion='20260831-nav-hierarchy';
const themeAssets=`\n<link rel="stylesheet" href="/bdc/bbdc/assets/bloomberg-terminal.css?v=${terminalVersion}">\n<script src="/bdc/bbdc/assets/bloomberg-terminal.js?v=${terminalVersion}"></script>\n`;

function rewriteLinks(html,source){
  const sourceDir=path.posix.dirname(source);
  return html.replace(/(["'])([^"'<>]*?\.html(?:[?#][^"'<>]*)?)(\1)/g,(match,quote,url)=>{
    if(/^(?:https?:)?\/\//i.test(url)||url.startsWith('mailto:')||url.startsWith('javascript:'))return match;
    const suffixIndex=url.search(/[?#]/),bare=suffixIndex>=0?url.slice(0,suffixIndex):url,suffix=suffixIndex>=0?url.slice(suffixIndex):'';
    const absolute=bare.startsWith('/');
    const resolved=path.posix.normalize(absolute?bare.slice(1):path.posix.join(sourceDir,bare));
    const alternate=routeMap.get(resolved);if(!alternate)return match;
    let next=absolute?'/'+alternate:path.posix.relative(sourceDir,alternate);
    if(!absolute&&bare.startsWith('./')&&!next.startsWith('.'))next='./'+next;
    return quote+next+suffix+quote;
  });
}

function addBodyMetadata(html,original){
  return html.replace(/<body([^>]*)>/i,(match,attrs)=>{
    let next=attrs;
    if(/\bclass\s*=/.test(next))next=next.replace(/class\s*=\s*(["'])(.*?)\1/i,(m,q,value)=>`class=${q}${value} bb-terminal-page${q}`);
    else next+=' class="bb-terminal-page"';
    next+=` data-bb-original="/${original}"`;
    return `<body${next}>`;
  });
}

function transform(html,original){
  let next=html;
  next=next.replace(/\/bdc\/bbdc\/sidebar(?:2)?\.html(?:\?[^'"\s)]*)?/g,`/bdc/bbdc/sidebar-bloomberg.html?v=${terminalVersion}`);
  next=next.replace(/\/bdc\/bbdc\/credit-intelligence\/companies\/coherus-oncology\/coherus-system\.js(?:\?[^'"\s>]*)?/g,`/bdc/bbdc/credit-intelligence/companies/coherus-oncology/coherus-system-bloomberg.js?v=${terminalVersion}`);
  next=next.replace(/\/bdc\/bbdc\/credit-intelligence\/public-credit-data\.js(?:\?[^'"\s>]*)?/g,`/bdc/bbdc/credit-intelligence/public-credit-data-bloomberg.js?v=${terminalVersion}`);
  next=rewriteLinks(next,original);
  next=next.replace(/(\/bdc\/bbdc\/credit-intelligence\/companies\/\$\{[^}]+\}\/index)\.html/g,'$1-bloomberg.html');
  next=addBodyMetadata(next,original);
  next=next.replace(/<title>([\s\S]*?)<\/title>/i,(m,title)=>{
    const clean=title.replace(/^\s*Orion\s*[|•]\s*/i,'').replace(/\s*[|•]\s*Orion\s*$/i,'').trim();
    return `<title>Orion Terminal • ${clean}</title>`;
  });
  if(!next.includes('/bdc/bbdc/assets/bloomberg-terminal.css'))next=next.replace(/<\/head>/i,themeAssets+'</head>');
  return next.split('\n').map(line=>line.replace(/[ \t]+$/,'')).join('\n');
}

const created=[];
for(const original of routes){
  if(original===customPage)continue;
  const sourcePath=path.join(root,original),target=altPath(original),targetPath=path.join(root,target);
  if(!fs.existsSync(sourcePath))throw new Error(`Missing source page: ${original}`);
  const html=fs.readFileSync(sourcePath,'utf8');
  fs.mkdirSync(path.dirname(targetPath),{recursive:true});
  fs.writeFileSync(targetPath,transform(html,original));
  created.push({original,alternate:target});
}

const originalSystem=path.join(root,bbdcRoot,'credit-intelligence/companies/coherus-oncology/coherus-system.js');
const bloombergSystem=path.join(root,bbdcRoot,'credit-intelligence/companies/coherus-oncology/coherus-system-bloomberg.js');
const systemSource=fs.readFileSync(originalSystem,'utf8');
const systemOutput=systemSource.replace(
  "const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();",
  "const file=(location.pathname.split('/').pop()||'index.html').toLowerCase().replace(/-bloomberg(?=\\.html$)/,'');"
);
if(systemOutput===systemSource)throw new Error('Could not patch Coherus page detection');
fs.writeFileSync(bloombergSystem,systemOutput);

const originalPublicCredit=path.join(root,bbdcRoot,'credit-intelligence/public-credit-data.js');
const bloombergPublicCredit=path.join(root,bbdcRoot,'credit-intelligence/public-credit-data-bloomberg.js');
const publicCreditSource=fs.readFileSync(originalPublicCredit,'utf8');
const publicCreditOutput=publicCreditSource.replace(
  /\nwindow\.addEventListener\('load', async \(\) => \{[\s\S]*?\n\}\);\s*$/,
  ''
);
if(publicCreditOutput===publicCreditSource)throw new Error('Could not remove classic public-credit sidebar loading');
fs.writeFileSync(bloombergPublicCredit,publicCreditOutput);

const manifest={generatedAt:'2026-08-27',custom:[{original:customPage,alternate:altPath(customPage)}],generated:created};
fs.writeFileSync(path.join(root,bbdcRoot,'bloomberg-pages.json'),JSON.stringify(manifest,null,2)+'\n');
const sidebarPath=path.join(root,bbdcRoot,'sidebar-bloomberg.html');
let sidebar=rewriteLinks(fs.readFileSync(sidebarPath,'utf8'),`${bbdcRoot}/sidebar-bloomberg.html`);
const navIdByCompany={
  'coherus-oncology':'coherus-nav','ocular-therapeutix':'ocular-nav','herbalife':'herbalife-nav'
};
const shortCompanyLabel={
  'coherus-oncology':'Coherus','ocular-therapeutix':'Ocular','herbalife':'Herbalife'
};
const terminalLink=(original,key,label,{active=false,indent=''}={})=>
  `${indent}<a href="/${altPath(original)}"${active?' aria-current="page"':''}><span class="bb-key">${key}</span><span>${label}</span></a>`;
const terminalLinks=(items,indent,activeOriginal='')=>items.map(([original,key,label])=>
  terminalLink(original,key,label,{active:original===activeOriginal,indent})
).join('\n');
const companyNavigation=companies.map(company=>{
  const id=navIdByCompany[company];
  const links=companyTabs.map(file=>{const [key,name]=companyTabMeta[file];return terminalLink(`${bbdcRoot}/credit-intelligence/companies/${company}/${file}`,key,name,{indent:'                  '})}).join('\n');
  return `              <div class="bb-nav-subgroup bb-company-group">\n                <button class="bb-nav-subhead bb-company-head" type="button" data-bb-target="${id}" aria-controls="${id}"><span>${shortCompanyLabel[company]}</span><span class="bb-caret">▼</span></button>\n                <div id="${id}" class="bb-nav-list nested bb-company-links is-collapsed">\n${links}\n                </div>\n              </div>`;
}).join('\n');
const briefingLinks=terminalLinks([
  [`${bbdcRoot}/briefing/daily-brief.html`,'01','Daily Brief'],
  [`${bbdcRoot}/briefing/ask-orion.html`,'02','Ask Orion']
],'          ');
const overviewLinks=terminalLinks([
  [`${bbdcRoot}/overview/overview.html`,'OV','Overview'],
  [`${bbdcRoot}/overview/financials.html`,'FA','Financials'],
  [`${bbdcRoot}/overview/comparables.html`,'RV','Comparables'],
  [`${bbdcRoot}/overview/news.html`,'CN','News']
],'          ',customPage);
const portfolioLinks=terminalLinks([
  [`${bbdcRoot}/portfolio/summary/summary.html`,'PS','Summary'],
  [`${bbdcRoot}/portfolio/positions/positions.html`,'POS','Positions'],
  [`${bbdcRoot}/portfolio/construction/construction.html`,'PC','Construction'],
  [`${bbdcRoot}/portfolio/raroc/raroc.html`,'RR','RAROC'],
  [`${bbdcRoot}/portfolio/quality/quality.html`,'PQ','Quality'],
  [`${bbdcRoot}/portfolio/activity/activity.html`,'PA','Activity'],
  [`${bbdcRoot}/portfolio/trends/trends.html`,'TR','Trends'],
  [`${bbdcRoot}/portfolio/neural-network/neural-network.html`,'NN','Neural Network']
],'          ');
const portfolioCreditLinks=terminalLinks([
  [`${bbdcRoot}/credit-intelligence/index.html`,'CD','Credit Dashboard'],
  [`${bbdcRoot}/credit-intelligence/portfolio-companies.html`,'CO','All Companies'],
  [`${bbdcRoot}/credit-intelligence/credit-watchlist.html`,'WL','Watchlist'],
  [`${bbdcRoot}/credit-intelligence/shadow-ratings.html`,'SR','Shadow Ratings'],
  [`${bbdcRoot}/credit-intelligence/monitoring-alerts.html`,'AL','Monitoring & Alerts']
],'              ');
const terminalNavigation=`  <nav class="bb-nav">\n    <section class="bb-nav-group bb-nav-root-group">\n      <button class="bb-nav-head bb-nav-root" type="button" data-bb-target="bbdc-nav" aria-controls="bbdc-nav"><span>BBDC</span><span class="bb-caret">▼</span></button>\n      <div id="bbdc-nav" class="bb-nav-list bb-nav-tree">\n        <div class="bb-nav-subgroup">\n          <button class="bb-nav-subhead bb-nav-section-head" type="button" data-bb-target="briefing-nav" aria-controls="briefing-nav"><span>Briefing</span><span class="bb-caret">▼</span></button>\n          <div id="briefing-nav" class="bb-nav-list nested is-collapsed">\n${briefingLinks}\n          </div>\n        </div>\n        <div class="bb-nav-subgroup">\n          <button class="bb-nav-subhead bb-nav-section-head" type="button" data-bb-target="overview-nav" aria-controls="overview-nav"><span>Overview</span><span class="bb-caret">▼</span></button>\n          <div id="overview-nav" class="bb-nav-list nested is-collapsed">\n${overviewLinks}\n          </div>\n        </div>\n        <div class="bb-nav-subgroup">\n          <button class="bb-nav-subhead bb-nav-section-head" type="button" data-bb-target="portfolio-nav" aria-controls="portfolio-nav"><span>Portfolio</span><span class="bb-caret">▼</span></button>\n          <div id="portfolio-nav" class="bb-nav-list nested is-collapsed">\n${portfolioLinks}\n          </div>\n        </div>\n        <div class="bb-nav-subgroup">\n          <button class="bb-nav-subhead bb-nav-section-head" type="button" data-bb-target="credits-nav" aria-controls="credits-nav"><span>Credits</span><span class="bb-caret">▼</span></button>\n          <div id="credits-nav" class="bb-nav-list nested is-collapsed">\n            <div class="bb-nav-subgroup bb-nav-tier-group">\n              <button class="bb-nav-subhead bb-nav-tier-head" type="button" data-bb-target="portfolio-credit-nav" aria-controls="portfolio-credit-nav"><span>Portfolio Credit</span><span class="bb-caret">▼</span></button>\n              <div id="portfolio-credit-nav" class="bb-nav-list nested is-collapsed">\n${portfolioCreditLinks}\n              </div>\n            </div>\n            <div class="bb-nav-subgroup bb-nav-tier-group">\n              <button class="bb-nav-subhead bb-nav-tier-head" type="button" data-bb-target="credit-analysis-nav" aria-controls="credit-analysis-nav"><span>Credit Analysis</span><span class="bb-caret">▼</span></button>\n              <div id="credit-analysis-nav" class="bb-nav-list nested is-collapsed">\n${companyNavigation}\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </section>\n  </nav>`;
const navStart=sidebar.indexOf('  <nav class="bb-nav">'),navEnd=sidebar.indexOf('\n  </nav>',navStart);
if(navStart<0||navEnd<0)throw new Error('Could not locate terminal navigation');
sidebar=sidebar.slice(0,navStart)+terminalNavigation+sidebar.slice(navEnd+'\n  </nav>'.length);
sidebar=sidebar.replace(/<a id="bb-classic-link" class="bb-mode-link" href="[^"]+">/,'<a id="bb-classic-link" class="bb-mode-link" href="/bdc/bbdc/overview/overview.html">');
fs.writeFileSync(sidebarPath,sidebar);
console.log(`Generated ${created.length} alternate pages plus the existing custom overview.`);
