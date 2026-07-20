(()=>{
  const selector='script,style,textarea,code,pre';
  const money=/\$(\d[\d,]*(?:\.\d+)?)\s*(K|k|M|m|MM|mm|million|millions)\b/g;
  function normalize(value){
    return value.replace(money,(_,raw,unit)=>{
      let amount=Number(raw.replace(/,/g,''));
      if(!Number.isFinite(amount))return _;
      if(/^k$/i.test(unit))amount/=1000;
      return '$'+amount.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})+'M';
    });
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
