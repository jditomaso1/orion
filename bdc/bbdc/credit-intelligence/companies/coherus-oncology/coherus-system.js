(()=>{
  const selector='script,style,textarea,code,pre';
  const money=/\$(\d[\d,]*(?:\.\d+)?)\s*(K|k|M|m|MM|mm|million|millions)\b/g;
  const neutralLabels=[
    [/independent Orion credit assessment/gi,'independent credit assessment'],
    [/independent Orion analytical assessment/gi,'independent analytical assessment'],
    [/Orion['’]s Coherus credit analysis/gi,'the Coherus credit analysis'],
    [/Orion['’]s Coherus analysis/gi,'the Coherus analysis'],
    [/Preliminary Orion View/gi,'Preliminary Credit View'],
    [/Orion Documentary View/gi,'Documentary Credit View'],
    [/Orion Industry View/gi,'Industry Credit View'],
    [/Orion Credit View/gi,'Credit View'],
    [/Orion documentary conclusions/gi,'Documentary conclusions'],
    [/Orion structural-credit conclusions/gi,'Structural-credit conclusions'],
    [/Orion scenario conclusion/gi,'Scenario conclusion'],
    [/Orion Scenario/gi,'Scenario'],
    [/Orion recommendation/gi,'Credit recommendation'],
    [/Orion rating assessment/gi,'Independent rating assessment'],
    [/Orion standalone credit assessment/gi,'Standalone credit assessment'],
    [/Orion shadow rating/gi,'Independent shadow rating'],
    [/Orion credit assessment/gi,'Independent credit assessment'],
    [/Orion analytical assessment/gi,'Independent analytical assessment'],
    [/Orion methodology/gi,'Methodology'],
    [/Orion indicative calculations/gi,'Indicative calculations'],
    [/Orion Assumptions/gi,'Analytical assumptions'],
    [/Orion Projections/gi,'Analytical projections'],
    [/Orion early-warning thresholds/gi,'Internal early-warning thresholds'],
    [/\(Orion calculation\)/gi,'(calculated)'],
    [/Orion Analysis/gi,'Credit analysis']
  ];
  function normalize(value){
    let next=value.replace(money,(_,raw,unit)=>{
      let amount=Number(raw.replace(/,/g,''));
      if(!Number.isFinite(amount))return _;
      if(/^k$/i.test(unit))amount/=1000;
      return '$'+amount.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})+'M';
    });
    neutralLabels.forEach(([pattern,replacement])=>{next=next.replace(pattern,replacement)});
    return next;
  }
  function visit(root){
    if(root.nodeType===Node.TEXT_NODE){
      if(root.parentElement?.closest(selector))return;
      const next=normalize(root.nodeValue||'');
      if(next!==root.nodeValue)root.nodeValue=next;
      return;
    }
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
    if(root.nodeType===Node.ELEMENT_NODE&&root.matches(selector))return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(visit);
  }
  visit(document.body);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(visit))).observe(document.body,{childList:true,subtree:true});
})();
