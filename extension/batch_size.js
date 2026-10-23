/* Batch Edit: explicit dimensions or schema-driven attributes, without PCD. */
(function(root){
'use strict';
function createBatchSizeController(env){
 let session=null,running=false,seq=0;
 const signature=t=>JSON.stringify(t);
 const same=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-5);
 function current(token){
  const s=env.snapshot();
  if(!session||session.token!==token||env.job()!==session.job||s.jobId!==session.jobId||s.sessionId!==session.adapterId)
   throw new Error('Phiên đã thay đổi; mở lại Batch Edit');
  return session;
 }
 async function readTrack(s){
  current(s.token);const data=await s.job.annotations.export();current(s.token);
  const t=data.tracks.find(t=>t.clientID===s.clientId);if(!t)throw new Error('Không tìm thấy track');return t;
 }
 async function unchanged(s){if(signature(await readTrack(s))!==s.signature)throw new Error('Track đã thay đổi; xem trước lại');}
 async function stateAt(s,frame){
  const states=await s.job.annotations.get(frame,true,[]);current(s.token);
  return states.find(x=>x.clientID===s.clientId&&x.objectType==='track'&&x.shapeType==='cuboid');
 }
 function editable(state,frame){
  if(state.lock||state.isGroundTruth)throw new Error('Frame '+frame+' bị khóa / ground truth');
  if(typeof state.save!=='function')throw new Error('Native save không khả dụng ở frame '+frame);
 }
 async function open(clientId){
  if(running)throw new Error('Đang áp dụng Batch Edit');env.assertEditable();
  const job=env.job(),snap=env.snapshot(),box=snap.boxes.find(b=>b.id===clientId);
  if(!box||box.objectType!=='track')throw new Error('Chọn một cuboid TRACK trước');
  const data=await job.annotations.export(),t=data.tracks.find(x=>x.clientID===clientId);
  if(!t||env.job()!==job||env.snapshot().sessionId!==snap.sessionId)throw new Error('Job / track đã thay đổi');
  const p=box.points;if(!env.math.parseCVAT16Points(p))throw new Error('Kích thước box không hợp lệ');
  session={token:'size-'+(++seq),job,jobId:snap.jobId,adapterId:snap.sessionId,clientId,signature:signature(t),consumed:false,plan:null};
  const state=await stateAt(session,snap.frame),label=(job.labels||[]).find(l=>l.id===t.label_id)||state?.label;
  session.schema=(label?.attributes||[]).map(a=>({id:a.id,name:a.name,mutable:a.mutable===true,inputType:a.inputType||a.input_type||'text',values:Array.from(a.values||[]),defaultValue:a.defaultValue??a.default_value??a.values?.[0]??''}));
  return {token:session.token,jobId:snap.jobId,clientId,start:job.startFrame,stop:job.stopFrame,frame:snap.frame,dimensions:Array.from(p).slice(6,9),label:label?.name||box.label_name||'',attributes:session.schema.map(a=>({...a,value:state?.attributes?.[a.id]??a.defaultValue}))};
 }
 function validateAttributes(s,p){
  if(!p.attributes||typeof p.attributes!=='object'||Array.isArray(p.attributes)||!Object.keys(p.attributes).length)throw new Error('Chọn ít nhất một thuộc tính');
  return Object.entries(p.attributes).map(([id,value])=>{
   const a=s.schema.find(a=>String(a.id)===id);if(!a)throw new Error('Thuộc tính không thuộc class đang chọn');
   if(typeof value!=='string')throw new Error('Giá trị thuộc tính phải là chuỗi');
   if(['select','radio'].includes(a.inputType)&&!a.values.includes(value)||a.inputType==='checkbox'&&!['true','false'].includes(value))throw new Error('Giá trị không hợp lệ: '+a.name);
   if(a.inputType==='number'){
    const n=Number(value),[min,max,step]=a.values.map(Number);
    if(!value.trim()||!Number.isFinite(n)||!Number.isFinite(min)||!Number.isFinite(max)||n<min||n>max||step>0&&Math.abs((n-min)/step-Math.round((n-min)/step))>1e-6)throw new Error('Giá trị số ngoài quy chuẩn: '+a.name);
   }
   return {...a,value};
  });
 }
 async function previewAttributes(s,p,epoch){
  const specs=validateAttributes(s,p),global=specs.filter(a=>!a.mutable),mutable=specs.filter(a=>a.mutable);
  if(global.length&&p.confirmTrackAttributes!==true)throw new Error(global.map(a=>a.name).join(', ')+' áp dụng TOÀN TRACK theo CVAT; cần xác nhận phạm vi');
  const plan={mode:'attributes',writes:[],boundaries:[],skipped:[],unchanged:[],keyframes:0,global:global.map(a=>a.name)};
  const attrsOf=state=>Object.fromEntries(s.schema.map(a=>[a.id,String(state.attributes?.[a.id]??a.defaultValue)]));
  let globalScheduled=false;
  for(let frame=p.from;frame<=p.to;frame++){
   const state=await stateAt(s,frame);if(!state||state.outside){plan.skipped.push(frame);continue;}editable(state,frame);
   const beforeAttrs=attrsOf(state),desired=Object.fromEntries([...mutable,...(!globalScheduled?global:[])].map(a=>[a.id,a.value]));
   if(global.length)globalScheduled=true;
   if(Object.entries(desired).every(([id,v])=>beforeAttrs[id]===v)){plan.unchanged.push(frame);continue;}
   plan.writes.push({frame,before:Array.from(state.points),beforeAttrs,attributes:desired});if(state.keyframe)plan.keyframes++;
   if(frame%20===0)await new Promise(r=>setTimeout(r,0));
  }
  // Attribute values are step-held. Even an existing boundary key may inherit
  // the edited value, so explicitly restore the original value at to+1.
  if(plan.writes.length&&mutable.length&&p.to<s.job.stopFrame){
   const frame=p.to+1,state=await stateAt(s,frame);if(!state)throw new Error('Không đọc được frame biên');editable(state,frame);
   const beforeAttrs=attrsOf(state);plan.boundaries.push({frame,before:Array.from(state.points),beforeAttrs,attributes:Object.fromEntries(mutable.map(a=>[a.id,beforeAttrs[a.id]]))});
  }
  // Save range first, then restore boundary: native attributes save is a no-op
  // when a boundary already has the old value before the range was changed.
  await unchanged(s);current(p.token);if(running||s.consumed||s.epoch!==epoch)throw new Error('Yêu cầu đã thay đổi; xem trước lại');
  s.plan=plan;s.planId=(s.planId||0)+1;
  return {token:s.token,planId:s.planId,mode:'attributes',clientId:s.clientId,from:p.from,to:p.to,frames:plan.writes.map(w=>w.frame),keyframes:plan.keyframes,boundaryFrames:plan.boundaries.map(w=>w.frame),skipped:plan.skipped,unchanged:plan.unchanged,globalAttributes:plan.global,attributes:specs.map(a=>({name:a.name,value:a.value,mutable:a.mutable}))};
 }
 function options(s,p){
  if(p.mode&&!['size','attributes'].includes(p.mode))throw new Error('Chọn Kích thước hoặc Thuộc tính');
  if(!Number.isInteger(p.from)||!Number.isInteger(p.to)||p.from<s.job.startFrame||p.to>s.job.stopFrame||p.to<p.from||p.to-p.from+1>1000)
   throw new Error('Chọn khoảng 1–1000 frame trong job (tính cả hai đầu)');
  if(p.mode==='attributes')return;
  if(!Array.isArray(p.dimensions)||p.dimensions.length!==3||!p.dimensions.every(v=>Number.isFinite(v)&&v>=0.01&&v<=100))
   throw new Error('L × W × H phải từ 0.01 đến 100 mét');
  if(!['bottom','center'].includes(p.anchor))throw new Error('Chọn giữ đáy hoặc giữ tâm');
 }
 async function preview(p){
  const s=current(p.token);if(running||s.consumed)throw new Error('Mở lại Batch Edit');
  env.assertEditable();options(s,p);s.plan=null;const epoch=s.epoch=(s.epoch||0)+1;await unchanged(s);
  if(p.mode==='attributes')return previewAttributes(s,p,epoch);
  const plan={writes:[],boundaries:[],skipped:[],unchanged:[],keyframes:0};
  for(let f=p.from;f<=p.to;f++){
   const state=await stateAt(s,f);
   if(!state||state.outside){plan.skipped.push(f);continue;}
   editable(state,f);const before=Array.from(state.points),after=before.slice();
   const g=env.math.parseCVAT16Points(before);if(!g)throw new Error('Box không hợp lệ ở frame '+f);
   after.splice(6,3,...p.dimensions);
   if(p.anchor==='bottom')after[2]+=g.zBottom-env.math.parseCVAT16Points(after).zBottom;
   if(same(before,after)){plan.unchanged.push(f);continue;}
   plan.writes.push({frame:f,before,after});if(state.keyframe)plan.keyframes++;
   if(f%20===0)await new Promise(r=>setTimeout(r,0));
  }
  // Freeze the original interpolation immediately outside this range BEFORE edits.
  if(plan.writes.length)for(const frame of [p.from-1,p.to+1]){
   if(frame<s.job.startFrame||frame>s.job.stopFrame)continue;
   const state=await stateAt(s,frame);
   if(!state||state.keyframe)continue;
   editable(state,frame);
   if(!env.math.parseCVAT16Points(state.points))throw new Error('Box biên không hợp lệ ở frame '+frame);
   plan.boundaries.push({frame,before:Array.from(state.points),after:Array.from(state.points)});
  }
  await unchanged(s);current(p.token);if(running||s.consumed||s.epoch!==epoch)throw new Error('Yêu cầu đã thay đổi; xem trước lại');
  s.plan=plan;s.planId=(s.planId||0)+1;
  return {token:s.token,planId:s.planId,clientId:s.clientId,from:p.from,to:p.to,dimensions:p.dimensions.slice(),anchor:p.anchor,
   frames:plan.writes.map(w=>w.frame),keyframes:plan.keyframes,boundaryFrames:plan.boundaries.map(w=>w.frame),skipped:plan.skipped,unchanged:plan.unchanged};
 }
 async function apply(p){
  const s=current(p.token);
  if(running||s.consumed||!s.plan||s.planId!==p.planId)throw new Error('Xem trước lại trước khi áp dụng');
  running=true;const appliedFrames=[],boundaryFrames=[];let error=null,locked=false;
  try{
   env.assertEditable();env.lock(true);locked=true;await unchanged(s);
   const boundaries=s.plan.boundaries.map(w=>({...w,boundary:true})),writes=s.plan.mode==='attributes'?[...s.plan.writes,...boundaries]:[...boundaries,...s.plan.writes];
   // Validate every target before the first native write, including protected boundaries.
   for(const w of writes){const state=await stateAt(s,w.frame);if(!state)throw new Error('Track đã thay đổi');editable(state,w.frame);if(!same(Array.from(state.points),w.before))throw new Error('Box đã thay đổi');if(w.beforeAttrs&&s.schema.some(a=>String(state.attributes?.[a.id]??a.defaultValue)!==w.beforeAttrs[a.id]))throw new Error('Thuộc tính đã thay đổi');}
   s.consumed=true;
   for(const w of writes){
    env.assertEditable();await unchanged(s);
    const state=await stateAt(s,w.frame);editable(state,w.frame);
    // Re-read states after earlier saves to preserve native metadata and IDs.
    if(w.attributes)state.attributes={...w.attributes};else state.points=w.after.slice();let saveError=null;
    try{await state.save();}catch(e){saveError=e;}
    const t=await readTrack(s),saved=t.shapes.find(x=>x.frame===w.frame);
    s.signature=signature(t);
    const actual=w.attributes?await stateAt(s,w.frame):null;
    const confirmed=w.attributes?actual&&same(actual.points,w.before)&&Object.entries(w.attributes).every(([id,v])=>String(actual.attributes?.[id]??s.schema.find(a=>String(a.id)===id)?.defaultValue)===v):saved&&same(saved.points,w.after);
    if(confirmed) (w.boundary?boundaryFrames:appliedFrames).push(w.frame);
    else throw saveError||new Error('Native save không lưu đúng box ở frame '+w.frame);
    if(saveError)throw saveError;
    if((appliedFrames.length+boundaryFrames.length)%20===0)await new Promise(r=>setTimeout(r,0));
   }
  }catch(e){
   error=e.message;
   // A failed range edit must still attempt to stop step-held attributes from
   // leaking past to+1. Do not claim rollback of already applied range values.
   if(s.plan?.mode==='attributes'&&appliedFrames.length)for(const w of s.plan.boundaries){
    if(boundaryFrames.includes(w.frame))continue;
    try{
     env.assertEditable();await unchanged(s);const state=await stateAt(s,w.frame);editable(state,w.frame);state.attributes={...w.attributes};await state.save();
     const t=await readTrack(s);s.signature=signature(t);const restored=await stateAt(s,w.frame);
     if(!Object.entries(w.attributes).every(([id,v])=>String(restored.attributes?.[id]??s.schema.find(a=>String(a.id)===id)?.defaultValue)===v))throw new Error('Không xác nhận được thuộc tính biên');
     boundaryFrames.push(w.frame);
    }catch(boundaryError){error+='; KHÔNG PHỤC HỒI ĐƯỢC BIÊN '+w.frame+': '+boundaryError.message;}
   }
  }
  finally{
   try{if(locked)await env.refresh(s.job);}catch(e){error=error||e.message;}
   if(locked)env.lock(false);running=false;
  }
  return {appliedFrames,boundaryFrames,error,partial:!!error&&(appliedFrames.length+boundaryFrames.length>0),saveRequired:appliedFrames.length+boundaryFrames.length>0};
 }
 function cancel(){if(running)throw new Error('Đang áp dụng Batch Edit');session=null;return {cancelled:true};}
 return {open,preview,apply,cancel};
}
if(typeof module==='object'&&module.exports)module.exports={createBatchSizeController};
root.__C3D_CREATE_BATCH_SIZE_CONTROLLER=createBatchSizeController;
})(typeof globalThis!=='undefined'?globalThis:this);
