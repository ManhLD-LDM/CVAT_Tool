(function(root){
'use strict';
function mount(env){
 const button=env.root.querySelector('#c3d-batch');let dialog=null,model=null,generation=0,working=false,applying=false,cancelConfirm=null,appearanceTimer=null;
 const request=env.request,getSnapshot=env.snapshot;
 async function open(){
  try{
   const s=getSnapshot();model=await request('BATCH_OPEN',{ref:env.reference(s.activeBoxId)});
   if(dialog)dialog.remove();
   dialog=document.createElement('dialog');dialog.className='c3d-batch-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Batch Track Review');
   dialog.addEventListener('keydown',event=>event.stopPropagation());
   dialog.innerHTML='<header><h2>Batch Track Review</h2><button data-action="close">Close</button></header>'+
    '<p data-info></p><p>Orange = original; green = proposal/draft. Automatic suggestions change position only. Drag to move, drag square handles to resize, Alt-drag in Top to rotate yaw. Manual drafts are saved only on Apply; interpolation between keys can change. Sensor motion compensation is not implemented.</p>'+
    '<div class="c3d-batch-controls"><label><input type="checkbox" data-sync-points checked> Theo point size CVAT</label><label>Point size (px) <input data-point-size type="number" min="0.5" max="12" step="0.5" value="2"></label><span data-point-source></span><label>Thao tác <select data-tool><option value="auto">Move / handle resize / Alt yaw</option><option value="move">Move</option><option value="resize">Resize handles</option><option value="yaw">Yaw (Top)</option></select></label><label><input type="checkbox" data-manual-keys> Cho phép sửa TAY keyframe gốc</label></div>'+
    '<div class="c3d-batch-controls"><label>From <input data-from type="number"></label><label>To <input data-to type="number"></label><button data-action="load">Compute range (max 60)</button><button data-action="prev">Previous</button><button data-action="next">Next</button><label>View / trang <select data-page-size><option value="3">3 · rộng</option><option value="7">7 · gọn</option></select></label></div>'+
    '<p data-progress role="status"></p><p data-summary></p><button data-action="cancel-compute" hidden>Cancel compute</button><div class="c3d-batch-cards"></div>'+
    '<section data-confirm hidden role="group" aria-label="Confirm batch apply"><p data-confirm-message></p><button data-action="confirm-apply">Confirm Apply</button><button data-action="cancel-apply">Back to review</button></section>'+
    '<footer><button data-action="export">Export preview (.json)</button><button data-action="apply">Apply selected proposals / drafts</button><span>Compute up to 60 frames; review 3 or 7 per page. Apply sequentially in groups of 20. Applied frames become keyframes; native Undo per frame. Save CVAT to persist.</span></footer>';
   document.body.append(dialog);dialog.showModal();
   dialog.querySelector('[data-info]').textContent='Job '+model.jobId+' · clientID #'+model.clientId+' · keyframes: '+model.keyframes.join(', ')+' · range '+model.start+'–'+model.stop;
   for(const selector of ['[data-from]','[data-to]']){
    const input=dialog.querySelector(selector);input.min=model.start;input.max=model.stop;
   }
   dialog.querySelector('[data-from]').value=model.defaultStart;dialog.querySelector('[data-to]').value=model.defaultStop;
   model.pageSize=3;dialog.dataset.density=3;model.page=model.defaultStart;model.cards=new Map();model.selected=new Set();model.complete=false;model.pointSize=2;
   function updatePointSize(){
    if(!dialog||!model)return;
    const sync=dialog.querySelector('[data-sync-points]').checked,input=dialog.querySelector('[data-point-size]'),appearance=getSnapshot()?.reviewAppearance;
    const size=sync?(appearance?.pointSize||2):Number(input.value);
    if(!Number.isFinite(size)||size<.5||size>12)return;
    input.disabled=sync||working;if(sync)input.value=size;
    dialog.querySelector('[data-point-source]').textContent=sync?(appearance?.source&&appearance.source!=='review-default'?'Đọc từ CVAT':'Không đọc được CVAT · mặc định 2 px'):'Tuỳ chỉnh riêng cho review';
    if(model.pointSize!==size){model.pointSize=size;for(const canvas of dialog.querySelectorAll('canvas[data-view]')){const card=model.cards.get(Number(canvas.dataset.frame));if(card)draw(canvas,canvas.dataset.view,card);}}
   }
   dialog.querySelector('[data-sync-points]').onchange=updatePointSize;dialog.querySelector('[data-point-size]').oninput=updatePointSize;
   dialog.querySelector('[data-manual-keys]').onchange=()=>{if(!working)renderPage();};
   updatePointSize();clearInterval(appearanceTimer);appearanceTimer=setInterval(updatePointSize,500);
   dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   dialog.querySelector('[data-action="close"]').onclick=close;
   dialog.querySelector('[data-action="load"]').onclick=load;
   dialog.querySelector('[data-action="cancel-compute"]').onclick=()=>{model.cancelCompute=true;progress('Cancelling after current frame…');};
   dialog.querySelector('[data-action="prev"]').onclick=()=>{model.page=Math.max(model.from,model.page-model.pageSize);renderPage();};
   dialog.querySelector('[data-action="next"]').onclick=()=>{model.page+=model.pageSize;renderPage();};
   dialog.querySelector('[data-page-size]').onchange=e=>{model.pageSize=Number(e.target.value);model.page=model.from+Math.floor((model.page-model.from)/model.pageSize)*model.pageSize;dialog.dataset.density=model.pageSize;renderPage();};
   dialog.querySelector('[data-action="apply"]').onclick=apply;
   dialog.querySelector('[data-action="export"]').onclick=()=>{
    const data={schema:'cvat-batch-preview/v1',version:'1.21.0',jobId:model.jobId,clientId:model.clientId,serverId:model.serverId,
     keyframes:model.keyframes,baseline:model.baseline,frames:[...model.cards.values()],note:'Diagnostic preview; sampled ROI only, not a full point-cloud sequence or certified ground truth'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='batch-job'+model.jobId+'-track'+model.clientId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   };
   await load();
  }catch(e){env.toast(e.message,true);}
 }
 function progress(text){if(dialog)dialog.querySelector('[data-progress]').textContent=text;}
 function summary(){
  const cards=[...model.cards.values()],anchors=cards.filter(c=>c.status==='anchor').length,proposals=cards.filter(c=>c.status==='proposal'&&!c.protected).length;
  if(dialog)dialog.querySelector('[data-summary]').textContent='Range '+model.from+'–'+model.to+' · Computed '+model.cards.size+' / '+(model.to-model.from+1)+' frames · Protected anchors '+anchors+' · Proposals '+proposals+' · Selected '+model.selected.size+' · Trang '+(Math.floor((model.page-model.from)/model.pageSize)+1)+' / '+Math.ceil((model.to-model.from+1)/model.pageSize)+' · '+(model.consumed?'Applied batch — reopen to recompute':model.complete?'Ready for review':'Incomplete — Compute again before Apply');
 }
 function disable(value){
  working=value;if(!dialog)return;
  for(const b of dialog.querySelectorAll('button'))b.disabled=(value&&!['close','cancel-compute'].includes(b.dataset.action))||b.dataset.permanent==='true'||(b.dataset.action==='apply'&&(model?.consumed||!model?.complete));
  for(const input of dialog.querySelectorAll('input,select'))input.disabled=value;
  dialog.querySelector('[data-point-size]').disabled=value||dialog.querySelector('[data-sync-points]').checked;
  dialog.querySelector('[data-action="cancel-compute"]').hidden=!value||applying;
  if(applying)dialog.querySelector('[data-action="close"]').disabled=true;
  if(!value){
   dialog.querySelector('[data-action="prev"]').disabled=model.page<=model.from;
   dialog.querySelector('[data-action="next"]').disabled=model.page+model.pageSize>model.to;
  }
 }
 function renderPage(){
  if(!dialog)return;
  model.page=Math.min(Math.max(model.page,model.from),model.from+Math.floor((model.to-model.from)/model.pageSize)*model.pageSize);
  const container=dialog.querySelector('.c3d-batch-cards');container.replaceChildren();
  for(let frame=model.page;frame<=Math.min(model.to,model.page+model.pageSize-1);frame++){
   const card=model.cards.get(frame);if(card)renderCard(card,container);
  }
  dialog.querySelector('[data-action="prev"]').textContent='Previous '+model.pageSize;dialog.querySelector('[data-action="next"]').textContent='Next '+model.pageSize;
  summary();disable(working);
 }
 async function load(){
  if(working||!dialog)return;
  const from=Number(dialog.querySelector('[data-from]').value),to=Number(dialog.querySelector('[data-to]').value);
  if(!dialog.querySelector('[data-from]').value.trim()||!dialog.querySelector('[data-to]').value.trim()||!Number.isInteger(from)||!Number.isInteger(to)||from<model.start||to>model.stop||from>to){progress('Invalid frame range');return;}
  if(to-from+1>60){progress('Select at most 60 frames (inclusive). Example: 24–83 = 60 frames.');return;}
  if(model.consumed){progress('Batch already applied; reopen preview to recompute.');return;}
  model.from=from;model.to=to;model.page=from;model.cancelCompute=false;model.complete=false;
  const run=++generation;model.cards.clear();model.selected.clear();renderPage();disable(true);
  try{
   await request('BATCH_BEGIN',{token:model.token,from,to});
   if(run!==generation||!dialog)return;
   for(let frame=from;frame<=to;frame++){
    if(model.cancelCompute)break;
    progress('Computing '+(frame-from+1)+' / '+(to-from+1)+' · frame '+frame+'…');
    const card=await request('BATCH_FRAME',{token:model.token,frame});
    if(run!==generation||!dialog)return;
    model.cards.set(frame,card);summary();
   }
   model.complete=model.cards.size===to-from+1;
   renderPage();
   progress(model.complete?'Preview only. Computed '+model.cards.size+' frames. Select reviewed proposals across pages; native keyframes cannot be overwritten.':'Compute cancelled. Partial preview only; Compute again before Apply.');
   if(model.complete&&![...model.cards.values()].some(c=>c.status==='proposal'))progress('Preview only. Computed '+model.cards.size+' frames. No editable proposals: native keyframes are protected; review/outside/unchanged frames are not auto-applied.');
  }catch(e){progress('Compute stopped: '+e.message+' · Compute again before Apply.');}
  finally{if(run===generation&&dialog){renderPage();disable(false);}}
 }
 function renderCard(card,container){
  const article=document.createElement('article');article.className='c3d-batch-card';article.dataset.frame=card.frame;
  const title=document.createElement('h3');title.textContent='Frame '+card.frame+' · '+card.status;article.append(title);
  if(card.original){
   for(const view of ['Top','Side','Front']){
    const label=document.createElement('span');label.textContent=view;article.append(label);
    const canvas=document.createElement('canvas');canvas.width=300;canvas.height=110;canvas.dataset.view=view;canvas.dataset.frame=card.frame;canvas.setAttribute('aria-label',view+' frame '+card.frame);article.append(canvas);draw(canvas,view,card);bindEditing(canvas,view,card);
   }
  }
  const flags=document.createElement('p');flags.textContent=(card.flags||[]).join(' · ');article.append(flags);
  const details=document.createElement('p');details.textContent=card.manual?'Manual draft · geometry changed; original QC counts are not a new full-cloud assessment.':'Support '+(card.beforeCount??0)+' → '+(card.afterCount??card.beforeCount??0)+(card.delta?' · ΔXYZ '+card.delta.map(n=>n.toFixed(2)).join('/')+' m':'');article.append(details);
  if(['proposal','manual'].includes(card.status)&&!card.protected&&!model.consumed){
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.accept=card.frame;check.checked=model.selected.has(card.frame);check.addEventListener('change',()=>{if(check.checked)model.selected.add(card.frame);else model.selected.delete(card.frame);summary();});
   label.append(check,document.createTextNode(' Accept this proposal'));article.append(label);
  }
  const lock=document.createElement('button');lock.textContent=card.protected?'Protected anchor':'Protect this frame';lock.disabled=card.protected;if(card.protected)lock.dataset.permanent='true';
  lock.onclick=async()=>{
   try{await request('BATCH_PROTECT',{token:model.token,frame:card.frame});model.selected.delete(card.frame);summary();card.protected=true;card.userProtected=true;card.proposed=null;card.status='anchor';article.querySelector('[data-accept]')?.closest('label')?.remove();lock.disabled=true;lock.textContent='Protected for this batch';lock.dataset.permanent='true';}
   catch(e){progress(e.message);}
  };article.append(lock);
  if(card.manual){const reset=document.createElement('button');reset.textContent='Reset manual draft';reset.onclick=async()=>{try{const original=await request('BATCH_RESET_DRAFT',{token:model.token,frame:card.frame});model.cards.set(card.frame,original);model.selected.delete(card.frame);renderPage();}catch(e){progress(e.message);}};article.append(reset);}
  const jump=document.createElement('button');jump.textContent='Open in CVAT';
  jump.onclick=()=>jumpTo(card.frame);article.append(jump);container.append(article);
 }
 function draw(canvas,view,card){
  const ctx=canvas.getContext('2d'),p=card.original,geometry=window.__C3D_REVIEW_GEOMETRY,math=window.__CVAT_COPILOT_MATH;if(!geometry||!math)return;
  const projection=geometry.projection(p,view),project=projection.point;
  ctx.fillStyle='#09090b';ctx.fillRect(0,0,300,110);ctx.fillStyle='#b4b4bd';
  const size=model.pointSize||2;
  for(const q of card.points||[]){const [x,y]=project(q);ctx.fillRect(x-size/2,y-size/2,size,size);}
  for(const [box,color] of [[p,'#fbbf24'],[card.proposed,'#34d399']]){
   if(!box)continue;const polygon=geometry.hull(math.cuboidVertices(box).map(project));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();
  }
  if(canEditCard(card)){ctx.fillStyle='#60a5fa';for(const h of projection.handles(card.proposed||p)){const [x,y]=h.position;ctx.fillRect(x-3,y-3,6,6);}}
 }
 function canEditCard(card){return model.complete&&!model.consumed&&card.original&&!card.locked&&!card.groundTruth&&!card.userProtected&&(!card.protected||card.status==='anchor'&&dialog.querySelector('[data-manual-keys]').checked)&&Math.abs(card.original[3])+Math.abs(card.original[4])<1e-4;}
 function bindEditing(canvas,view,card){
  let drag=null;
  const xy=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*300/r.width,(e.clientY-r.top)*110/r.height];};
  canvas.style.touchAction='none';
  canvas.onpointerdown=e=>{
   if(working||!canEditCard(card)||e.button!==0)return;
   const projection=window.__C3D_REVIEW_GEOMETRY.projection(card.original,view),start=xy(e),base=(card.proposed||card.original).slice(),tool=dialog.querySelector('[data-tool]').value;
   const handle=projection.handles(base).find(h=>Math.hypot(start[0]-h.position[0],start[1]-h.position[1])<7),center=projection.point(base);
   if(tool==='resize'&&!handle)return;if((tool==='yaw'||e.altKey)&&view!=='Top'){progress('Yaw: use Top view');return;}
   const mode=tool==='yaw'||e.altKey?'yaw':tool==='move'?'move':handle?'resize':'move';
   if(mode==='yaw'&&Math.hypot(start[0]-center[0],start[1]-center[1])<5)return;
   drag={projection,start,base,mode,axis:handle?.axis,prior:card.proposed?.slice()||null,moved:false};canvas.setPointerCapture(e.pointerId);e.preventDefault();
  };
  canvas.onpointermove=e=>{
   if(!drag)return;const end=xy(e),dx=end[0]-drag.start[0],dy=end[1]-drag.start[1];if(Math.hypot(dx,dy)<1)return;drag.moved=true;
   card.proposed=drag.mode==='yaw'?drag.projection.yaw(drag.base,drag.start,end):drag.mode==='resize'?drag.projection.resize(drag.base,drag.axis,dx,dy):drag.projection.move(drag.base,dx,dy);
   for(const el of canvas.closest('article').querySelectorAll('canvas'))draw(el,el.dataset.view,card);
  };
  canvas.onpointerup=async()=>{
   if(!drag)return;const end=drag;drag=null;if(!end.moved)return;disable(true);
   try{const next=await request('BATCH_DRAFT',{token:model.token,frame:card.frame,points:card.proposed,allowKeyframe:dialog.querySelector('[data-manual-keys]').checked});model.cards.set(card.frame,next);model.selected.add(card.frame);progress('Manual draft staged at frame '+card.frame+'. Select reviewed frames and Apply.');}
   catch(e){card.proposed=end.prior;progress(e.message);}finally{disable(false);renderPage();}
  };
  canvas.onpointercancel=()=>{if(drag){card.proposed=drag.prior;drag=null;renderPage();}};
 }
 async function jumpTo(frame){
  if(working)return;
  const fields=[...document.querySelectorAll('input[role="spinbutton"][aria-valuemin][aria-valuemax]')].filter(n=>!env.root.contains(n)&&!dialog.contains(n)&&Number(n.getAttribute('aria-valuemax'))===model.stop);
  if(fields.length!==1){progress('Cannot identify native frame control; navigate to frame '+frame+' in CVAT.');return;}
  const field=fields[0];field.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,String(frame));
  field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
  for(let i=0;i<30;i++){
   await new Promise(resolve=>setTimeout(resolve,100));
   const s=await request('GET_SNAPSHOT');
   if(s.frame===frame&&s.jobId===model.jobId){
    await request('SELECT_OBJECT',{ref:{sessionId:s.sessionId,jobId:s.jobId,frame:s.frame,revision:s.revision,clientId:model.clientId},focus:true});
    await close();env.toast('CVAT frame '+frame+' selected. Adjust the box, then reopen Batch Track Review.');return;
   }
  }
  progress('Frame navigation was not confirmed; use CVAT frame control manually.');
 }
 function confirmApply(frames){
  disable(true);dialog.querySelector('[data-action="cancel-compute"]').hidden=true;
  const panel=dialog.querySelector('[data-confirm]');panel.hidden=false;
  panel.querySelector('[data-confirm-message]').textContent='Apply to Job '+model.jobId+', track #'+model.clientId+', frames '+frames.join(', ')+'? Automatic proposals preserve keyframes; explicitly enabled manual drafts may edit them. Native interpolation can change between keys. Each applied frame has a separate Undo entry.';
  return new Promise(resolve=>{
   const finish=value=>{cancelConfirm=null;panel.hidden=true;if(dialog)disable(false);resolve(value);};
   cancelConfirm=()=>finish(false);
   for(const action of ['confirm-apply','cancel-apply'])panel.querySelector('[data-action="'+action+'"]').disabled=false;
   panel.querySelector('[data-action="confirm-apply"]').onclick=()=>finish(true);
   panel.querySelector('[data-action="cancel-apply"]').onclick=cancelConfirm;
   panel.querySelector('[data-action="cancel-apply"]').focus();
  });
 }
 async function apply(){
  if(working||!dialog||model.consumed||!model.complete)return;
  const frames=[...model.selected].sort((a,b)=>a-b);
  if(!frames.length){progress('Select at least one reviewed proposal');return;}
  if(!await confirmApply(frames)||!dialog)return;
  applying=true;disable(true);
  try{
   progress('Applying '+frames.length+' reviewed frames sequentially in groups of 20…');
   const result=await request('BATCH_APPLY',{token:model.token,frames,confirmManualKeyframes:dialog.querySelector('[data-manual-keys]').checked});
   if(!dialog||!model)return;
   progress('Applied: '+result.appliedFrames.join(', ')+(result.error?' · '+result.error:'')+' · '+result.undo);
   dialog.querySelectorAll('[data-accept]').forEach(n=>{n.checked=false;n.disabled=true;});
   model.consumed=true;model.selected.clear();summary();
  }catch(e){progress(e.message+' · Verify native history before retrying.');}
  finally{applying=false;disable(false);if(dialog)dialog.querySelector('[data-action="apply"]').disabled=true;}
 }
 async function close(){
  if(applying)return;
  cancelConfirm?.();
  clearInterval(appearanceTimer);appearanceTimer=null;
  ++generation;const old=dialog;dialog=null;working=false;model=null;old?.remove();
  try{await request('BATCH_CANCEL');}catch(_){}
 }
 button.addEventListener('click',open);
 return {dispose:()=>{clearInterval(appearanceTimer);button.removeEventListener('click',open);if(applying){++generation;dialog?.remove();dialog=null;model=null;}else close();}};
}
root.__C3D_BATCH_UI={mount};
})(typeof window!=='undefined'?window:globalThis);
