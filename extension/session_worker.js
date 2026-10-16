/* Runs only in the extension service worker. No cookie values enter page events. */
function sessionContext(tab, patterns) {
    const url=new URL(tab.url);
    if(!patterns.some(p=>{
        if(p==='<all_urls>')return true;
        const host=new URL(p.replace('*://','https://').replace(/\/\*$/,'/')).hostname;
        return host.startsWith('*.')?(url.hostname.endsWith(host.slice(1))):url.hostname===host;
    }))throw new Error('Unsupported CVAT server');
    const match=url.pathname.match(/\/jobs\/(\d+)(?:\/|$)/);
    if(!match||!['https:','http:'].includes(url.protocol))throw new Error('Open a CVAT job first');
    return {tabId:tab.id,origin:url.origin,jobId:Number(match[1])};
}
if(typeof module!=='undefined')module.exports={sessionContext};
if(typeof chrome!=='undefined'&&chrome.runtime?.onMessage){
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.action==='RELOAD_EXTENSION'||message?.type==='RELOAD_EXTENSION'){
   reply({ok:true});
   chrome.runtime.reload();
   return true;
  }
  (async()=>{
   const patterns=chrome.runtime.getManifest().host_permissions;
   if(message?.type==='C3D_OPEN_SESSION'){
    if(sender.id!==chrome.runtime.id||!sender.tab)throw new Error('Invalid sender');
    sessionContext(sender.tab,patterns);
    await chrome.tabs.create({url:chrome.runtime.getURL('session.html')+'?tab='+sender.tab.id});
    return {};
   }
   if(!['C3D_CONTEXT','C3D_COOKIES'].includes(message?.type))throw new Error('Unsupported command');
   if(sender.id!==chrome.runtime.id||sender.url?.split('?')[0]!==chrome.runtime.getURL('session.html'))throw new Error('Open the extension session page');
   const tab=await chrome.tabs.get(Number(message.tabId)),context=sessionContext(tab,patterns);
   if(message.type==='C3D_CONTEXT')return context;
   if(message.origin!==context.origin||message.jobId!==context.jobId)throw new Error('CVAT job changed');
   const stores=await chrome.cookies.getAllCookieStores();
   const store=stores.find(s=>s.tabIds.includes(tab.id))?.id;
   if(!store)throw new Error('Cookie store unavailable');
   const cookies=await chrome.cookies.getAll({url:context.origin+'/',storeId:store});
   const choose=name=>cookies.filter(c=>c.name===name).sort((a,b)=>b.path.length-a.path.length)[0];
   const session=choose('sessionid'),csrf=choose('csrftoken');
   return {session:session?{value:session.value,httpOnly:session.httpOnly,expires:session.expirationDate||null}:null,csrf:csrf?.value||null};
  })().then(result=>reply({ok:true,result}),()=>reply({ok:false,error:'Session unavailable, job changed, or extension permission missing.'}));
  return true;
 });
}
