(function(root){
'use strict';
function mount(env){
 const button=env.root.querySelector('#c3d-batch');let dialog=null,model=null,generation=0,working=false,applying=false;
 const request=env.request,getSnapshot=env.snapshot;
 async function open(){
  try{
   const s=getSnapshot();model=await request('BATCH_OPEN',{ref:env.reference(s.activeBoxId)});
   if(dialog)dialog.remove();
   dialog=document.createElement('dialog');dialog.className='c3d-batch-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Batch Track Review');
   dialog.addEventListener('keydown',event=>event.stopPropagation());
   dialog.innerHTML='<header><h2>Batch Track Review</h2><button data-action="close">Close</button></header>'+
    '<p data-info></p><p>Native keyframes are protected. Orange = current box; green = proposal. Position only: dimensions and yaw stay fixed. Proposals require human review; sensor motion compensation is not implemented yet.</p>'+
    '<div class="c3d-batch-controls"><label>From <input data-from type="number"></label><label>To <input data-to type="number"></label><button data-action="load">Compute range (max 60)</button><button data-action="prev">Previous 7</button><button data-action="next">Next 7</button></div>'+
    '<p data-progress role="status"></p><p data-summary></p><button data-action="cancel-compute" hidden>Cancel compute</button><div class="c3d-batch-cards"></div>'+
    '<footer><button data-action="export">Export preview (.json)</button><button data-action="apply">Apply selected position proposals</button><span>Compute up to 60 frames; review 7 per page. Apply sequentially in groups of 20. Applied frames become keyframes; native Undo per frame. Save CVAT to persist.</span></footer>';
   document.body.append(dialog);dialog.showModal();
   dialog.querySelector('[data-info]').textContent='Job '+model.jobId+' · clientID #'+model.clientId+' · keyframes: '+model.keyframes.join(', ')+' · range '+model.start+'–'+model.stop;
   for(const selector of ['[data-from]','[data-to]']){
    const input=dialog.querySelector(selector);input.min=model.start;input.max=model.stop;
   }
   dialog.querySelector('[data-from]').value=model.defaultStart;dialog.querySelector('[data-to]').value=model.defaultStop;
   model.page=model.defaultStart;model.cards=new Map();model.selected=new Set();model.complete=false;
   dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   dialog.querySelector('[data-action="close"]').onclick=close;
   dialog.querySelector('[data-action="load"]').onclick=load;
   dialog.querySelector('[data-action="cancel-compute"]').onclick=()=>{model.cancelCompute=true;progress('Cancelling after current frame…');};
   dialog.querySelector('[data-action="prev"]').onclick=()=>{model.page=Math.max(model.from,model.page-7);renderPage();};
   dialog.querySelector('[data-action="next"]').onclick=()=>{model.page+=7;renderPage();};
   dialog.querySelector('[data-action="apply"]').onclick=apply;
   dialog.querySelector('[data-action="export"]').onclick=()=>{
    const data={schema:'cvat-batch-preview/v1',version:'1.14.5',jobId:model.jobId,clientId:model.clientId,serverId:model.serverId,
     keyframes:model.keyframes,baseline:model.baseline,frames:[...model.cards.values()],note:'Diagnostic preview; sampled ROI only, not a full point-cloud sequence or certified ground truth'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='batch-job'+model.jobId+'-track'+model.clientId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   };
   await load();
  }catch(e){env.toast(e.message,true);}
 }
 function progress(text){if(dialog)dialog.querySelector('[data-progress]').textContent=text;}
 function summary(){
  if(dialog)dialog.querySelector('[data-summary]').textContent='Range '+model.from+'–'+model.to+' · Computed '+model.cards.size+' / '+(model.to-model.from+1)+' frames · Selected '+model.selected.size+' · '+(model.complete?'Ready for review':'Incomplete — Compute again before Apply');
 }
 function disable(value){
  working=value;if(!dialog)return;
  for(const b of dialog.querySelectorAll('button'))b.disabled=(value&&!['close','cancel-compute'].includes(b.dataset.action))||b.dataset.permanent==='true'||(b.dataset.action==='apply'&&(model?.consumed||!model?.complete));
  for(const input of dialog.querySelectorAll('input'))input.disabled=value;
  dialog.querySelector('[data-action="cancel-compute"]').hidden=!value||applying;
  if(applying)dialog.querySelector('[data-action="close"]').disabled=true;
  if(!value){
   dialog.querySelector('[data-action="prev"]').disabled=model.page<=model.from;
   dialog.querySelector('[data-action="next"]').disabled=model.page+7>model.to;
  }
 }
 function renderPage(){
  if(!dialog)return;
  model.page=Math.min(Math.max(model.page,model.from),model.from+Math.floor((model.to-model.from)/7)*7);
  const container=dialog.querySelector('.c3d-batch-cards');container.replaceChildren();
  for(let frame=model.page;frame<=Math.min(model.to,model.page+6);frame++){
   const card=model.cards.get(frame);if(card)renderCard(card,container);
  }
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
  }catch(e){progress('Compute stopped: '+e.message+' · Compute again before Apply.');}
  finally{if(run===generation&&dialog){renderPage();disable(false);}}
 }
 function renderCard(card,container){
  const article=document.createElement('article');article.className='c3d-batch-card';article.dataset.frame=card.frame;
  const title=document.createElement('h3');title.textContent='Frame '+card.frame+' · '+card.status;article.append(title);
  if(card.original){
   for(const view of ['Top','Side','Front']){
    const label=document.createElement('span');label.textContent=view;article.append(label);
    const canvas=document.createElement('canvas');canvas.width=300;canvas.height=110;canvas.setAttribute('aria-label',view+' frame '+card.frame);article.append(canvas);draw(canvas,view,card);
   }
  }
  const flags=document.createElement('p');flags.textContent=(card.flags||[]).join(' · ');article.append(flags);
  const details=document.createElement('p');details.textContent='Support '+(card.beforeCount??0)+' → '+(card.afterCount??card.beforeCount??0)+(card.delta?' · ΔXYZ '+card.delta.map(n=>n.toFixed(2)).join('/')+' m':'');article.append(details);
  if(card.status==='proposal'&&!card.protected&&!model.consumed){
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.accept=card.frame;check.checked=model.selected.has(card.frame);check.addEventListener('change',()=>{if(check.checked)model.selected.add(card.frame);else model.selected.delete(card.frame);summary();});
   label.append(check,document.createTextNode(' Accept this proposal'));article.append(label);
  }
  const lock=document.createElement('button');lock.textContent=card.protected?'Protected anchor':'Protect this frame';lock.disabled=card.protected;if(card.protected)lock.dataset.permanent='true';
  lock.onclick=async()=>{
   try{await request('BATCH_PROTECT',{token:model.token,frame:card.frame});model.selected.delete(card.frame);summary();card.protected=true;card.proposed=null;card.status='anchor';article.querySelector('[data-accept]')?.closest('label')?.remove();lock.disabled=true;lock.textContent='Protected for this batch';lock.dataset.permanent='true';}
   catch(e){progress(e.message);}
  };article.append(lock);
  const jump=document.createElement('button');jump.textContent='Open in CVAT';
  jump.onclick=()=>jumpTo(card.frame);article.append(jump);container.append(article);
 }
 function draw(canvas,view,card){
  const ctx=canvas.getContext('2d'),p=card.original,c=Math.cos(p[5]),s=Math.sin(p[5]);
  const project=q=>{const dx=q[0]-p[0],dy=q[1]-p[1],z=q[2]-p[2],x=c*dx+s*dy,y=-s*dx+c*dy;return view==='Top'?[x,y]:view==='Side'?[x,z]:[y,z];};
  const dims=view==='Top'?[p[6],p[7]]:view==='Side'?[p[6],p[8]]:[p[7],p[8]];
  const scale=Math.min(270/(dims[0]+2.8),85/(dims[1]+2));
  ctx.fillStyle='#09090b';ctx.fillRect(0,0,300,110);ctx.fillStyle='#b4b4bd';
  for(const q of card.points||[]){const [x,y]=project(q);ctx.fillRect(150+x*scale,55-y*scale,1,1);}
  for(const [box,color] of [[p,'#fbbf24'],[card.proposed,'#34d399']]){
   if(!box)continue;const [x,y]=project(box);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(150+(x-dims[0]/2)*scale,55-(y+dims[1]/2)*scale,dims[0]*scale,dims[1]*scale);
  }
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
 async function apply(){
  if(working||!dialog||model.consumed||!model.complete)return;
  const frames=[...model.selected].sort((a,b)=>a-b);
  if(!frames.length){progress('Select at least one reviewed proposal');return;}
  if(!window.confirm('Apply position proposals to Job '+model.jobId+', track #'+model.clientId+', frames '+frames.join(', ')+'? Existing keyframes stay protected. Each frame has a separate Undo entry.'))return;
  applying=true;disable(true);
  try{
   progress('Applying '+frames.length+' reviewed frames sequentially in groups of 20…');
   const result=await request('BATCH_APPLY',{token:model.token,frames});
   if(!dialog||!model)return;
   progress('Applied: '+result.appliedFrames.join(', ')+(result.error?' · '+result.error:'')+' · '+result.undo);
   dialog.querySelectorAll('[data-accept]').forEach(n=>{n.checked=false;n.disabled=true;});
   model.consumed=true;model.selected.clear();summary();
  }catch(e){progress(e.message+' · Verify native history before retrying.');}
  finally{applying=false;disable(false);if(dialog)dialog.querySelector('[data-action="apply"]').disabled=true;}
 }
 async function close(){
  if(applying)return;
  ++generation;const old=dialog;dialog=null;working=false;model=null;old?.remove();
  try{await request('BATCH_CANCEL');}catch(_){}
 }
 button.addEventListener('click',open);
 return {dispose:()=>{button.removeEventListener('click',open);if(applying){++generation;dialog?.remove();dialog=null;model=null;}else close();}};
}
root.__C3D_BATCH_UI={mount};
})(typeof window!=='undefined'?window:globalThis);
