/* Batch operations use native annotations export/get/ObjectState.save only. */
(function(root){
'use strict';
function createBatchController(env){
 const {math,batchMath}=env;let session=null,running=false,seq=0;
 const clouds=new Map();
 const signature=t=>JSON.stringify(t);
 const keyframes=t=>new Set(t.shapes.map(s=>s.frame));
 const sameGeometry=(a,b)=>math.parseCVAT16Points(a)&&math.parseCVAT16Points(b)&&a.slice(0,9).every((v,i)=>{
  const delta=v-b[i];return Math.abs(i>=3&&i<=5?Math.atan2(Math.sin(delta),Math.cos(delta)):delta)<=(i>=3&&i<=5?1e-5:1e-4);
 });
 function current(){
  const job=env.job(),snapshot=env.snapshot();
  if(!session||job!==session.job||snapshot.jobId!==session.jobId||snapshot.sessionId!==session.adapterId)
   throw new Error('Batch session expired; reopen selected track');
  return job;
 }
 async function track(){
  const job=current(),data=await job.annotations.export();
  const found=data.tracks.find(t=>t.clientID===session.clientId);
  if(!found)throw new Error('Native track identity not found');
  return found;
 }
 async function unchanged(){
  const t=await track();if(signature(t)!==session.signature)throw new Error('Track changed; reload batch preview');
  return t;
 }
 async function stateAt(frame){
  const job=current();
  const states=await job.annotations.get(frame,true,[]);
  current();return {states,state:states.find(s=>s.clientID===session.clientId&&s.objectType==='track'&&s.shapeType==='cuboid')};
 }
 function frameCheck(frame){
  if(!Number.isInteger(frame)||frame<session.start||frame>session.stop)throw new Error('Frame outside job');
 }
 async function pointsAt(frame){
  if(clouds.has(frame))return clouds.get(frame);
  const owned=session,job=current(),data=await job.frames.get(frame);
  if(data.deleted)throw new Error('Frame deleted');
  const image=await data.data();
  current();
  if(!image.imageData?.arrayBuffer)throw new Error('Native frame is not a PCD blob');
  if(image.imageData.size>128*1024*1024)throw new Error('PCD exceeds batch memory limit');
  const points=env.parsePCD(await image.imageData.arrayBuffer());
  current();if(session!==owned)throw new Error('Batch cancelled');
  clouds.set(frame,points);
  while(clouds.size>2)clouds.delete(clouds.keys().next().value);
  return points;
 }
 async function open(clientId){
  if(running)throw new Error('Batch apply in progress');
  const job=env.job(),s=env.snapshot();
  const target=s.boxes.find(b=>b.id===clientId);
  if(!target||target.objectType!=='track')throw new Error('Choose a native CUBOID TRACK first');
  if(!job?.annotations?.export||!job?.annotations?.get||!job?.frames?.get||!env.parsePCD)
   throw new Error('CVAT build does not expose native batch APIs');
  const data=await job.annotations.export(),t=data.tracks.find(t=>t.clientID===clientId);
  if(!t)throw new Error('Cannot map selected clientID to native track');
  if(env.job()!==job)throw new Error('Job changed');
  const start=job.startFrame,stop=job.stopFrame;
  if(!Number.isInteger(start)||!Number.isInteger(stop))throw new Error('Native frame bounds unavailable');
  session={id:'batch-'+(++seq),adapterId:s.sessionId,job,jobId:s.jobId,clientId,serverId:t.id??null,
   signature:signature(t),start,stop,proposals:new Map(),computed:new Set(),epoch:0,protected:new Set(),consumed:false};
  clouds.clear();
  const frames=t.shapes.map(x=>x.frame).sort((a,b)=>a-b);
  return {token:session.id,jobId:s.jobId,clientId,serverId:session.serverId,start,stop,keyframes:frames,
   defaultStart:Math.max(start,frames[0]),defaultStop:Math.min(stop,Math.max(start,frames[0]+6)),
   baseline:JSON.parse(JSON.stringify(t))};
 }
 function token(payload){current();if(payload.token!==session.id)throw new Error('Stale batch token');}
 async function begin(payload){
  token(payload);if(running||session.consumed)throw new Error('Batch already applied; reopen preview');
  frameCheck(payload.from);frameCheck(payload.to);
  if(payload.from>payload.to||payload.to-payload.from+1>60)throw new Error('Select 1–60 frames inclusive');
  await unchanged();token(payload);session.epoch++;session.range=[payload.from,payload.to];session.proposals.clear();session.computed.clear();clouds.clear();
  return {from:payload.from,to:payload.to};
 }
 async function read(payload){
  token(payload);frameCheck(payload.frame);
  if(session.range&&(payload.frame<session.range[0]||payload.frame>session.range[1]))throw new Error('Frame outside compute range');
  if(running)throw new Error('Batch apply in progress');
  const owned=session,epoch=session.epoch;await unchanged();
  const {state,states}=await stateAt(payload.frame);
  if(session!==owned||session.epoch!==epoch)throw new Error('Batch compute superseded; recompute range');
  if(!state||state.outside){session.computed.add(payload.frame);return {frame:payload.frame,status:'outside',protected:true,flags:['Outside/not present; no proposal']};}
  const p=Array.from(state.points),original=p.slice();
  const raw=await pointsAt(payload.frame);
  if(session!==owned||session.epoch!==epoch)throw new Error('Batch compute superseded or cancelled');
  const groundPoints=[],roi=[],step=Math.max(1,Math.ceil(raw.length/3/160000));
  const cs=Math.cos(p[5]),sn=Math.sin(p[5]);
  for(let i=0;i<raw.length;i+=3){
   if(i>0&&i%98304===0){await new Promise(resolve=>setTimeout(resolve,0));if(session!==owned)throw new Error('Batch cancelled');}
   const x=raw[i],y=raw[i+1],z=raw[i+2];if(!Number.isFinite(x+y+z))continue;
   if((i/3)%step===0)groundPoints.push([x,y,z]);
   const dx=x-p[0],dy=y-p[1];
   if(Math.abs(cs*dx+sn*dy)<=p[6]/2+1.2&&Math.abs(-sn*dx+cs*dy)<=p[7]/2+1.2&&Math.abs(z-p[2])<=p[8]/2+1)roi.push([x,y,z]);
  }
  const ground=new math.GroundIndex(groundPoints).estimate({points:p});
  const t=await unchanged(),protectedFrame=keyframes(t).has(payload.frame)||session.protected.has(payload.frame)||state.lock||state.isGroundTruth;
  const ordered=t.shapes.slice().sort((a,b)=>a.frame-b.frame),left=ordered.filter(s=>s.frame<payload.frame).at(-1),right=ordered.find(s=>s.frame>payload.frame);
  const bracketed=!!left&&!left.outside&&!!right&&!right.outside;
  const result=protectedFrame?{status:'anchor',flags:['Protected native keyframe / reviewed frame'],beforeCount:math.extractBoxROI(roi,{points:p},0).length}
   :!bracketed?{status:'review',flags:['No bounding keyframes on both sides; add another keyframe before refinement'],beforeCount:math.extractBoxROI(roi,{points:p},0).length}
   :batchMath.refinePosition(math,roi,p,ground,states.filter(s=>s.clientID!==session.clientId&&!s.outside&&s.shapeType==='cuboid').map(s=>({points:Array.from(s.points)})));
  const card={frame:payload.frame,original,protected:!!protectedFrame,nativeKeyframe:!!state.keyframe,locked:!!state.lock,groundTruth:!!state.isGroundTruth,userProtected:session.protected.has(payload.frame),ground:{accepted:ground.accepted,confidence:ground.confidence,reason:ground.reason,a:ground.a,b:ground.b,c:ground.c,rmse:ground.rmse,inlierCount:ground.inlierCount,radius:ground.radius},
   ...result,points:batchMath.sampleROI(roi,p),analysisPointCount:roi.length,pointsAreSampled:roi.length>4000,label:state.label?.name};
  if(session!==owned||session.epoch!==epoch)throw new Error('Batch compute superseded or cancelled');
  session.proposals.set(payload.frame,{...card,state});
  session.computed.add(payload.frame);
  return card;
 }
 async function protect(payload){
  token(payload);frameCheck(payload.frame);
  if(running)throw new Error('Batch apply in progress');
  session.protected.add(payload.frame);session.proposals.delete(payload.frame);return {protected:true,frame:payload.frame};
 }
 async function draft(payload){
  token(payload);frameCheck(payload.frame);if(running||session.consumed)throw new Error('Batch already applied');
  env.assertEditable();await unchanged();token(payload);
  const card=session.proposals.get(payload.frame),{state}=await stateAt(payload.frame);
  token(payload);
  if(!card?.original||!state||state.outside||state.lock||state.isGroundTruth||session.protected.has(payload.frame))throw new Error('Frame protected or unavailable for manual editing');
  if(state.keyframe&&payload.allowKeyframe!==true)throw new Error('Enable explicit manual keyframe editing first');
  const p=payload.points;
  if(!Array.isArray(p)||!math.parseCVAT16Points(p)||p.slice(6,9).some(v=>v<.01||v>100)||Math.hypot(...p.slice(0,3).map((v,i)=>v-card.original[i]))>20||p[3]!==card.original[3]||p[4]!==card.original[4])throw new Error('Invalid manual geometry');
  const base=card.autoCard||{...card,state:undefined};
  const next={...card,autoCard:base,manual:true,manualKeyframe:!!state.keyframe,protected:false,status:'manual',proposed:p.slice(),flags:['Manual draft: review before Apply'],delta:p.slice(0,3).map((v,i)=>v-card.original[i])};
  session.proposals.set(payload.frame,next);const {state:unused,autoCard,...view}=next;return view;
 }
 async function resetDraft(payload){
  token(payload);if(running||session.consumed)throw new Error('Batch already applied');await unchanged();token(payload);
  const card=session.proposals.get(payload.frame);if(!card?.autoCard)throw new Error('No manual draft');
  const base=card.autoCard;session.proposals.set(payload.frame,base);return {...base,state:undefined};
 }
 async function apply(payload){
  token(payload);if(running||session.consumed)throw new Error('Batch already applied; reopen preview');
  if(!Array.isArray(payload.frames)||!payload.frames.length||payload.frames.length>60)throw new Error('Select 1–60 proposed frames');
  if(session.range&&session.computed.size!==session.range[1]-session.range[0]+1)throw new Error('Compute incomplete; compute the entire range before Apply');
  const frames=[...new Set(payload.frames)].sort((a,b)=>a-b);
  const plan=[];
  await unchanged();token(payload);
  for(const f of frames){
   frameCheck(f);const proposal=session.proposals.get(f);
   if(!proposal||proposal.protected||session.protected.has(f)||!['proposal','manual'].includes(proposal.status))throw new Error('Selected frame has no editable proposal');
   if(proposal.manualKeyframe&&payload.confirmManualKeyframes!==true)throw new Error('Confirm explicit manual edits to existing keyframes');
   if(!math.parseCVAT16Points(proposal.proposed)||!proposal.manual&&!sameGeometry(proposal.proposed.slice(0,3).concat(proposal.original.slice(3)),proposal.proposed))
    throw new Error('Invalid position-only proposal; recompute batch');
   const {state}=await stateAt(f);token(payload);
   if(!state||state.outside||state.keyframe&&!proposal.manualKeyframe||state.lock||state.isGroundTruth||!sameGeometry(Array.from(state.points),proposal.original))
    throw new Error('Frame changed or became protected; reload batch');
   plan.push({frame:f,points:proposal.proposed,manualKeyframe:proposal.manualKeyframe});
  }
  await unchanged();token(payload);if(running||session.consumed)throw new Error('Batch already applied; reopen preview');env.assertEditable();
  running=true;session.consumed=true;env.lock(true);
  const applied=[];let error=null;
  try{
   for(let index=0;index<plan.length;index++){
    if(index>0&&index%20===0)await new Promise(resolve=>setTimeout(resolve,0));
    const item=plan[index];
    await unchanged();token(payload);env.assertEditable();
    const {state}=await stateAt(item.frame);token(payload);
    if(state.keyframe&&!item.manualKeyframe||state.lock||state.isGroundTruth)throw new Error('Frame protected during apply');
    state.points=item.points.slice();
    try{
     await state.save();
     const savedTrack=await track(),saved=savedTrack.shapes.find(s=>s.frame===item.frame);
     const changed=signature(savedTrack)!==session.signature;
     if(changed){applied.push(item.frame);session.signature=signature(savedTrack);}
     if(!changed||!saved||saved.outside||!sameGeometry(saved.points,item.points))
      throw new Error('Native save was not confirmed at frame '+item.frame+'; inspect Undo/history');
    }
    catch(e){
        const observed=signature(await track());
        if(observed!==session.signature){if(!applied.includes(item.frame))applied.push(item.frame);session.signature=observed;}
        else if(!applied.includes(item.frame))state.points=session.proposals.get(item.frame).original.slice();
        throw new Error('Native save failed; inspect Undo/history. '+e.message);
    }
    session.signature=signature(await track());
   }
  }catch(e){error=e.message;}
  finally{
   try{await env.refresh(session.job);}catch(e){error=(error?error+'; ':'')+'Native edit may be committed; UI refresh failed: '+e.message;}
   env.lock(false);running=false;
  }
  return {appliedFrames:applied,error,partial:!!error,undo:'Each applied frame has its own native Undo entry. Save CVAT to persist.'};
 }
 function cancel(){if(running)throw new Error('Apply already started; wait for result');session=null;clouds.clear();return {cancelled:true};}
 return {open,begin,read,protect,draft,resetDraft,apply,cancel};
}
root.__C3D_CREATE_BATCH_CONTROLLER=createBatchController;
if(typeof module!=='undefined')module.exports={createBatchController};
})(typeof window!=='undefined'?window:globalThis);
