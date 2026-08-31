import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'bdc/bbdc/bloomberg-pages.json'),'utf8'));
const entries=[...manifest.custom,...manifest.generated];
const originals=new Map(entries.map(entry=>[entry.original,entry.alternate]));
const errors=[];
const internalHtml=/href\s*=\s*(["'])([^"']+\.html(?:[?#][^"']*)?)\1/gi;
const inlineScript=/<script(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;

function resolveInternal(source,url){
  if(/^(?:https?:)?\/\//i.test(url)||/^(?:mailto|javascript):/i.test(url)||url.startsWith('#'))return null;
  const bare=url.split(/[?#]/)[0];
  if(!bare.endsWith('.html'))return null;
  return path.posix.normalize(bare.startsWith('/')?bare.slice(1):path.posix.join(path.posix.dirname(source),bare));
}

if(entries.length!==71)errors.push(`Expected 71 alternate pages, found ${entries.length}`);
if(new Set(entries.map(x=>x.alternate)).size!==entries.length)errors.push('Duplicate alternate routes found in manifest');

for(const entry of entries){
  const file=path.join(root,entry.alternate);
  if(!fs.existsSync(file)){errors.push(`Missing alternate page: ${entry.alternate}`);continue}
  const html=fs.readFileSync(file,'utf8');
  const isCustom=entry.alternate.endsWith('/overview-bloomberg.html');
  if(!isCustom){
    if(!html.includes('/bdc/bbdc/assets/bloomberg-terminal.css'))errors.push(`Missing terminal stylesheet: ${entry.alternate}`);
    if(!html.includes('/bdc/bbdc/assets/bloomberg-terminal.js'))errors.push(`Missing terminal script: ${entry.alternate}`);
    if(!html.includes('bb-terminal-page'))errors.push(`Missing terminal body class: ${entry.alternate}`);
    if(!html.includes(`data-bb-original="/${entry.original}"`))errors.push(`Incorrect classic-page mapping: ${entry.alternate}`);
    if(/\/bdc\/bbdc\/sidebar(?:2)?\.html/.test(html))errors.push(`Still loads classic sidebar: ${entry.alternate}`);
    if(entry.original.includes('/coherus-oncology/')&&!html.includes('/coherus-oncology/coherus-bloomberg.css'))errors.push(`Missing Coherus terminal readability stylesheet: ${entry.alternate}`);
  }
  for(const match of html.matchAll(internalHtml)){
    const resolved=resolveInternal(entry.alternate,match[2]);if(!resolved)continue;
    if(resolved.includes('${'))continue;
    if(resolved.startsWith('bdc/bbdc/')&&!fs.existsSync(path.join(root,resolved)))errors.push(`Broken internal link in ${entry.alternate}: ${match[2]}`);
    if(originals.has(resolved))errors.push(`Bloomberg page links back into classic mode: ${entry.alternate} -> ${match[2]}`);
  }
  let scriptIndex=0;
  for(const match of html.matchAll(inlineScript)){
    scriptIndex+=1;const attrs=match[1],code=match[2];
    if(/type\s*=\s*["'](?!text\/javascript|application\/javascript)/i.test(attrs)||!code.trim())continue;
    try{new Function(code)}catch(error){errors.push(`Inline script ${scriptIndex} fails syntax check in ${entry.alternate}: ${error.message}`)}
  }
}

const sidebarPath=path.join(root,'bdc/bbdc/sidebar-bloomberg.html');
const sidebar=fs.readFileSync(sidebarPath,'utf8');
for(const match of sidebar.matchAll(internalHtml)){
  const href=match[2];if(href==='/bdc/bbdc/overview/overview.html')continue;
  const resolved=resolveInternal('bdc/bbdc/sidebar-bloomberg.html',href);if(!resolved)continue;
  if(!fs.existsSync(path.join(root,resolved)))errors.push(`Broken sidebar link: ${href}`);
  if(originals.has(resolved))errors.push(`Classic-mode link in terminal sidebar: ${href}`);
}
const sidebarAlternateLinks=[...sidebar.matchAll(internalHtml)].map(match=>match[2]).filter(href=>href.includes('-bloomberg.html'));
if(sidebarAlternateLinks.length!==71)errors.push(`Expected 71 alternate sidebar links, found ${sidebarAlternateLinks.length}`);
const requiredSidebarTargets=[
  'bbdc-nav','briefing-nav','overview-nav','portfolio-nav','credits-nav','portfolio-credit-nav','credit-analysis-nav',
  'coherus-nav','ocular-nav','herbalife-nav'
];
for(const id of requiredSidebarTargets){
  if(!sidebar.includes(`data-bb-target="${id}"`))errors.push(`Missing terminal sidebar control for ${id}`);
  if(!sidebar.includes(`id="${id}"`))errors.push(`Missing terminal sidebar section ${id}`);
}
const hierarchyOrder=['id="credits-nav"','data-bb-target="portfolio-credit-nav"','id="portfolio-credit-nav"','data-bb-target="credit-analysis-nav"','id="credit-analysis-nav"','data-bb-target="coherus-nav"','data-bb-target="ocular-nav"','data-bb-target="herbalife-nav"'];
let priorIndex=-1;
for(const marker of hierarchyOrder){
  const index=sidebar.indexOf(marker);
  if(index<=priorIndex)errors.push(`Terminal credit navigation hierarchy is out of order at ${marker}`);
  priorIndex=index;
}

for(const asset of ['bdc/bbdc/assets/bloomberg-terminal.js','scripts/generate-bloomberg-pages.mjs']){
  try{new Function(fs.readFileSync(path.join(root,asset),'utf8').replace(/^import .*$/gm,''))}catch(error){
    if(!asset.endsWith('.mjs'))errors.push(`Script syntax check failed for ${asset}: ${error.message}`);
  }
}
const coherusSystem=fs.readFileSync(path.join(root,'bdc/bbdc/credit-intelligence/companies/coherus-oncology/coherus-system-bloomberg.js'),'utf8');
if(!coherusSystem.includes("replace(/-bloomberg(?=\\.html$)/,''"))errors.push('Coherus terminal page-name compatibility patch is missing');
const publicCreditSystem=fs.readFileSync(path.join(root,'bdc/bbdc/credit-intelligence/public-credit-data-bloomberg.js'),'utf8');
if(publicCreditSystem.includes('window.addEventListener(\'load\''))errors.push('Public-credit terminal script still initializes the classic sidebar');
if(publicCreditSystem.includes('/bdc/bbdc/sidebar.html'))errors.push('Public-credit terminal script still references the classic sidebar');
const watchlistTerminal=fs.readFileSync(path.join(root,'bdc/bbdc/credit-intelligence/credit-watchlist-bloomberg.html'),'utf8');
if(!watchlistTerminal.includes('/bdc/bbdc/credit-intelligence/public-credit-data-bloomberg.js'))errors.push('Terminal watchlist does not use the terminal public-credit loader');

if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Validated ${entries.length} alternate pages, ${sidebarAlternateLinks.length} terminal navigation links, and all inline scripts.`);
