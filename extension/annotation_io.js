/* Native 3D JSON editing and explicitly confirmed full recreation. */
(function(root){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value)),kinds=['tracks','shapes'];
const attrs=list=>Object.fromEntries((list||[]).map(a=>[a.spec_id,String(a.value)]));
function createAnnotationIO(env){
 let plan=null,seq=0,running=false;
 function context(payload={}){
  const s=env.snapshot(),job=env.job();
  if(!s.connected||payload.jobId!=null&&payload.jobId!==s.jobId||payload.sessionId!=null&&payload.sessionId!==s.sessionId)throw new Error('Job/session changed; reopen import');
  if(!job?.annotations?.export||!job.annotations.get)throw new Error('Native annotation APIs unavailable');
  return {s,job};
 }
 function editable(){env.assertEditable();if(running)throw new Error('Annotation import already in progress');}
 async function exported(payload){
  if(running)throw new Error('Wait for annotation import before exporting');
  const {s,job}=context(payload),data=clone(await job.annotations.export());context({jobId:s.jobId,sessionId:s.sessionId});
  const identities=kinds.flatMap(kind=>(data[kind]||[]).map(t=>t.clientID));
  if(identities.some(id=>!Number.isInteger(id))||new Set(identities).size!==identities.length)throw new Error('Native export lacks unique display IDs; reload extension and the CVAT tab before exporting');
  data.c3d={toolVersion:'1.21.1',exportedAt:new Date().toISOString(),schema:'cvat-3d-tool-annotations/v2',jobId:s.jobId,origin:env.origin(),sessionId:s.sessionId,frameRange:{start:job.startFrame,stop:job.stopFrame},replaceIdentity:'clientID',identity:'clientID is the CVAT display ID used for in-place editing; id is database metadata only',source:'native-editor-including-unsaved'};
  data.labels_manifest=clone(job.labels||[]);
  return {success:true,jobId:s.jobId,data,trackCount:data.tracks?.length||0,shapeCount:data.shapes?.length||0};
 }
 function remap(input,job,data,requireSchema=false){
  const labels=job.labels||[],source=data.labels_manifest||[],item=clone(input),src=source.find(l=>l.id===item.label_id);
  if(requireSchema&&!src)throw new Error('Cross-job template is missing label schema for '+item.label_id);
  const label=src?labels.find(l=>l.name===src.name):labels.find(l=>l.id===item.label_id);
  if(!label)throw new Error('Cannot map label '+item.label_id+' exactly; labels_manifest required');
  const targetAttrs=label.attributes||[];
  function mapAttrs(values){
   return (values||[]).map(a=>{
    const from=src?.attributes?.find(x=>x.id===a.spec_id),to=from?targetAttrs.find(x=>x.name===from.name&&x.mutable===from.mutable):targetAttrs.find(x=>x.id===a.spec_id);
    if(!to||requireSchema&&!from)throw new Error('Cannot map attribute '+a.spec_id+' exactly; import stopped');
    return {spec_id:to.id,value:String(a.value)};
   });
  }
  item.label_id=label.id;item.attributes=mapAttrs(item.attributes);
  for(const shape of item.shapes||[])shape.attributes=mapAttrs(shape.attributes);
  return item;
 }
 function validate(item,kind,job){
  if(item.elements?.length)throw new Error('Skeleton import is not supported by 3D ID-preserving import');
  const shapes=kind==='tracks'?item.shapes:[item];
  if(!Array.isArray(shapes)||!shapes.length)throw new Error('Track must contain keyframes');
  const frames=new Set();
  for(const s of shapes){
   if(s.type!=='cuboid'||!env.math.parseCVAT16Points(s.points)||!Number.isInteger(s.frame)||s.frame<job.startFrame||s.frame>job.stopFrame||frames.has(s.frame))throw new Error('Invalid/duplicate/out-of-job cuboid frame');
   if(s.outside!=null&&typeof s.outside!=='boolean'||s.occluded!=null&&typeof s.occluded!=='boolean')throw new Error('Invalid visibility flags');
   frames.add(s.frame);
  }
  // Native Track.frame is creation metadata; edits can move the first keyframe.
  // Visibility/interpolation are defined by shapes, not this metadata anchor.
  if(kind==='tracks')item.frame=Math.min(...frames);
  if(item.group!=null&&(!Number.isInteger(item.group)||item.group<0))throw new Error('Invalid group');
 }
 async function preview(payload){
  editable();if(payload.mode&& !['replace','edit','recreate'].includes(payload.mode))throw new Error('Only edit or explicit full replacement is supported');
  const {s,job}=context(payload),wrapper=payload.payload?.annotations?payload.payload:null,data=clone(wrapper?.annotations||payload.payload);
  if(wrapper?.jobId!=null){
   if(data.c3d&&(data.c3d.jobId!==wrapper.jobId||wrapper.origin&&data.c3d.origin!==wrapper.origin))throw new Error('Conflicting file job/server metadata');
   if(!data.c3d)data.c3d={jobId:wrapper.jobId,origin:wrapper.origin||env.origin()};
  }
  if(!data||!Array.isArray(data.tracks||[])||!Array.isArray(data.shapes||[]))throw new Error('Invalid annotation file');
  if((data.tags||[]).length||(data.intervals||[]).length)throw new Error('This 3D import supports cuboid tracks/shapes only; tags/intervals are not silently discarded');
  if(data.c3d?.origin&&data.c3d.origin!==env.origin())throw new Error('File belongs to another server; this template workflow supports jobs on the same server');
  const crossJob=data.c3d?.jobId!=null&&data.c3d.jobId!==s.jobId;
  if(crossJob&&!Array.isArray(data.labels_manifest))throw new Error('Cross-job template requires labels_manifest to map labels and attributes by name');
  const current=clone(await job.annotations.export()),rows=[],seen=new Set(),mode=payload.mode==='recreate'?'recreate':'edit';
  for(const kind of kinds)for(let i=0;i<(data[kind]||[]).length;i++){
   const original=data[kind][i],key=kind+':'+i,item=remap(original,job,data,crossJob);validate(item,kind,job);
   // User-facing identity is #clientID. Never substitute database ID or array order.
   const target=Number.isInteger(item.clientID)?(current[kind]||[]).find(t=>t.clientID===item.clientID):null;
   if(target&&mode==='edit'){const identity=kind+':'+target.clientID;if(seen.has(identity))throw new Error('Duplicate target ID in file');seen.add(identity);}
   const targetLabel=target?job.labels.find(l=>l.id===target.label_id)?.name:null;
   rows.push({key,kind,item,target,sourceClientId:original.clientID??null,sourceServerId:original.id??null,targetLabel:targetLabel??null,labelMismatch:!!target&&item.label_id!==target.label_id,
    targetClientId:target?.clientID??null,targetServerId:target?.id??null,dbDiffers:!!target&&item.id!=null&&target.id!==item.id,startFrame:item.frame,label:job.labels.find(l=>l.id===item.label_id).name,frames:kind==='tracks'?item.shapes.length:1});
  }
  if(!rows.length)throw new Error('No cuboid objects in file');
  editable();context({jobId:s.jobId,sessionId:s.sessionId});
  plan={token:'io-'+(++seq),job,s,mode,current,crossJob,signature:JSON.stringify(current),rows};
  return {token:plan.token,mode,jobId:s.jobId,existing:kinds.reduce((n,k)=>n+(current[k]?.length||0),0),
   crossJob,source:{jobId:data.c3d?.jobId??null,origin:data.c3d?.origin??null,frameRange:data.c3d?.frameRange??null,toolVersion:data.c3d?.toolVersion??null,hasDisplayIds:rows.every(r=>Number.isInteger(r.sourceClientId))},
   targets:kinds.flatMap(kind=>(current[kind]||[]).map(t=>({kind,clientID:t.clientID,serverID:t.id??null,frame:t.frame,label:job.labels.find(l=>l.id===t.label_id)?.name||String(t.label_id)}))),
   rows:rows.map(({item,target,...r})=>({...r,matched:!!target})),frameRange:{start:job.startFrame,stop:job.stopFrame},note:'Edit existing #clientIDs across the entire job using the file keyframes and native interpolation. No object creation or deletion.'};
 }
 async function getState(job,kind,item){
  const frame=kind==='tracks'?Math.min(...item.shapes.map(s=>s.frame)):item.frame;
  return (await job.annotations.get(frame,true,[])).find(s=>s.clientID===item.clientID&&s.objectType===(kind==='tracks'?'track':'shape'));
 }
 async function recreate(payload,p,job,s){
  if(payload.confirmRecreate!==true)throw new Error('Confirm deletion of all current annotations and creation of new objects');
  if(payload.mapping||payload.scope||!Array.isArray(payload.keys)||payload.keys.length!==p.rows.length||new Set(payload.keys).size!==p.rows.length||p.rows.some(r=>!payload.keys.includes(r.key)))throw new Error('Full replacement must import every file object without ID mapping');
  if(typeof job.annotations.commit!=='function')throw new Error('Native replacement/Undo API unavailable');
  if((p.current.tags||[]).length||(p.current.intervals||[]).length)throw new Error('Full replacement currently supports cuboid-only jobs; tags/intervals must be handled in CVAT');
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed after preview; reopen file');
  for(const kind of kinds)for(const item of p.current[kind]||[]){
   if(item.elements?.length||(kind==='tracks'?item.shapes:[item]).some(x=>x.type!=='cuboid'))throw new Error('Full replacement requires cuboid-only current annotations');
   const state=await getState(job,kind,item);
   if(!state||state.lock||state.isGroundTruth)throw new Error('Current annotation is missing/locked/read-only; nothing replaced');
  }
  const clean=item=>{const result=clone(item);delete result.id;delete result.clientID;for(const shape of result.shapes||[]){delete shape.id;delete shape.clientID;}return result;};
  const incoming={tracks:[],shapes:[]};for(const row of p.rows)incoming[row.kind].push(clean(row.item));
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed during preflight');
  context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
  if(running||plan!==p)throw new Error('Import preview was consumed or replaced');
  running=true;plan=null;env.lock(true);let error=null;const added=[],removed=[];
  try{
   // Native commit imports first, marks the old collection removed and records
   // one Undo/Redo action. Never clear the editor in a separate delete step.
   await job.annotations.commit(incoming,{tracks:p.current.tracks||[],shapes:p.current.shapes||[]},s.frame);
   const after=await job.annotations.export();
   for(const kind of kinds){
    const actual=after[kind]||[],expected=incoming[kind];
    if(actual.length!==expected.length||actual.some(x=>(p.current[kind]||[]).some(old=>old.clientID===x.clientID)))throw new Error('Replacement collection not confirmed; inspect Undo');
    const geometry=item=>JSON.stringify({label:item.label_id,shapes:(kind==='tracks'?item.shapes:[item]).slice().sort((a,b)=>a.frame-b.frame).map(x=>({frame:x.frame,points:x.points.slice(0,9),outside:!!x.outside,occluded:!!x.occluded,rotation:x.rotation||0,z:x.z_order||0}))});
    if(JSON.stringify(actual.map(geometry).sort())!==JSON.stringify(expected.map(geometry).sort()))throw new Error('Replacement geometry not confirmed; inspect Undo');
    for(const item of actual)added.push({kind,clientID:item.clientID});
    for(const item of p.current[kind]||[])removed.push(item.clientID);
   }
  }catch(e){error=e.message;}
  finally{try{await env.refresh(job);}catch(e){error=(error?error+'; ':'')+'Render refresh failed: '+e.message;}env.lock(false);running=false;}
  return {success:!error,error,changed:[],added,removed,saveRequired:true,message:error?'Replacement may be partial. Inspect native Undo before retrying.':'Replaced in editor with new CVAT IDs. Save CVAT to persist; native Undo can restore the previous annotations.'};
 }
 async function apply(payload){
  editable();const {s,job}=context(payload),p=plan;
  if(!p||p.token!==payload.token||p.job!==job||p.s.sessionId!==s.sessionId)throw new Error('Import preview expired');
  if(p.crossJob&&payload.confirmCrossJob!==true)throw new Error('Confirm that source and target jobs use the same scene, coordinates and frame numbers before editing');
  if(p.mode==='recreate')return recreate(payload,p,job,s);
  if(!Array.isArray(payload.keys)||!payload.keys.length||new Set(payload.keys).size!==payload.keys.length)throw new Error('Choose at least one ID');
  let selected=payload.keys.map(key=>p.rows.find(row=>row.key===key));if(selected.some(r=>!r))throw new Error('Unknown file selection');
  const mapping=payload.mapping??{};
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).some(key=>!payload.keys.includes(key)))throw new Error('Invalid explicit ID mapping');
  if(payload.scope&&payload.scope!=='selected')throw new Error('Only edit selected existing IDs is supported; no creation or deletion');
  selected=selected.map(row=>{
   if(!Object.hasOwn(mapping,row.key))return {...row};
   const id=mapping[row.key];if(!Number.isInteger(id))throw new Error('Target display ID must be an integer');
   const target=(p.current[row.kind]||[]).find(t=>t.clientID===id);
   if(!target)throw new Error('Target CVAT #'+id+' not found for '+row.kind);
   return {...row,target};
  });
  const targetIds=selected.filter(r=>r.target).map(r=>r.kind+':'+r.target.clientID);
  if(new Set(targetIds).size!==targetIds.length)throw new Error('Duplicate target ID: two source objects cannot edit the same CVAT object');
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed after preview; reopen file');
  const updating=selected;
  if(selected.some(r=>!r.target))throw new Error('Selected clientID not found; missing objects are never created');
  for(const row of updating){
   if(row.kind==='shapes'&&row.item.frame!==row.target.frame)throw new Error('A standalone shape cannot move frames; use a track for multi-frame edits');
   if((row.item.group||0)!==(row.target.group||0)&&!job.annotations.group)throw new Error('Group changed but native grouping API is unavailable');
   const state=await getState(job,row.kind,row.target);if(!state||typeof state.save!=='function'||state.lock||state.isGroundTruth)throw new Error('Target ID #'+row.target.clientID+' is missing/locked/read-only');
   // Preflight both incoming and obsolete keyframes before any native write.
   if(row.kind==='tracks')for(const frame of new Set([...row.item.shapes,...row.target.shapes].map(x=>x.frame))){
    const state=(await job.annotations.get(frame,true,[])).find(x=>x.clientID===row.target.clientID);
    if(!state||typeof state.save!=='function'||state.lock||state.isGroundTruth)throw new Error('A target frame is protected');
   }
  }
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed during preflight');
  context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
  if(running||plan!==p)throw new Error('Import preview was consumed or replaced');
  running=true;plan=null;env.lock(true);const changed=[],added=[],removed=[],groups=[];let error=null,edits=0;
  try{
   {
    for(const row of updating){
     env.assertEditable();context({jobId:s.jobId,sessionId:s.sessionId});
     const shapes=row.kind==='tracks'?row.item.shapes.slice().sort((a,b)=>a.frame-b.frame):[row.item];
     const label=job.labels.find(l=>l.id===row.item.label_id),defaults=Object.fromEntries((label.attributes||[]).map(a=>[a.id,a.defaultValue??a.default_value??a.values?.[0]??'']));
     let resolvedAttributes={...defaults,...attrs(row.item.attributes)};
     for(const shape of shapes){
      const state=(await job.annotations.get(shape.frame,true,[])).find(x=>x.clientID===row.target.clientID);
      if(!state||state.lock||state.isGroundTruth)throw new Error('Target became protected during import');
      state.label=label;state.points=shape.points.slice();
      state.rotation=shape.rotation||0;state.outside=shape.outside||false;state.occluded=shape.occluded||false;state.zOrder=shape.z_order||0;
      // ObjectState merges attributes; pass every schema field to clear stale values.
      resolvedAttributes={...resolvedAttributes,...attrs(shape.attributes)};state.attributes={...resolvedAttributes};
      if(row.kind==='tracks')state.keyframe=true;
      await state.save();if(!changed.includes(row.target.clientID))changed.push(row.target.clientID);
      if(++edits%20===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     if(row.kind==='tracks')for(const old of row.target.shapes)if(!row.item.shapes.some(x=>x.frame===old.frame)){
      const state=(await job.annotations.get(old.frame,true,[])).find(x=>x.clientID===row.target.clientID);state.keyframe=false;await state.save();
      if(++edits%20===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     const actual=(await job.annotations.export())[row.kind].find(x=>x.clientID===row.target.clientID);
     if(!actual||actual.id!==row.target.id||actual.label_id!==row.item.label_id)throw new Error('Edit identity/label changed; inspect Undo');
     const actualShapes=row.kind==='tracks'?actual.shapes:[actual];
     if(actualShapes.length!==shapes.length||shapes.some(shape=>{const found=actualShapes.find(x=>x.frame===shape.frame);return !found||!!found.outside!==!!shape.outside||!!found.occluded!==!!shape.occluded||(found.z_order||0)!==(shape.z_order||0)||Math.abs((found.rotation||0)-(shape.rotation||0))>1e-4||found.points.slice(0,9).some((v,i)=>Math.abs(i>=3&&i<=5?Math.atan2(Math.sin(v-shape.points[i]),Math.cos(v-shape.points[i])):v-shape.points[i])>1e-4);} ))throw new Error('Edit geometry/keyframe set not confirmed; inspect Undo');
     let expectedAttrs={...defaults,...attrs(row.item.attributes)};
     for(const shape of shapes){
      expectedAttrs={...expectedAttrs,...attrs(shape.attributes)};
      const saved=actualShapes.find(x=>x.frame===shape.frame),actualAttrs={...attrs(actual.attributes),...attrs(saved.attributes)};
      if((label.attributes||[]).some(a=>String(actualAttrs[a.id])!==String(expectedAttrs[a.id])))throw new Error('Edit attributes not confirmed; inspect Undo');
     }
    }
   }
   // Group numbers are local to a collection. Recreate changed grouping among
   // selected objects only; never attach them to unrelated existing members.
   const changedGroups=new Set(selected.filter(r=>(r.item.group||0)!==(r.target.group||0)).map(r=>r.item.group||0));
   for(const sourceGroup of changedGroups){
    context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
    const rows=selected.filter(r=>(r.item.group||0)===sourceGroup),states=[];
    const after=await job.annotations.export();
    for(const row of rows){const actual=after[row.kind].find(t=>t.clientID===row.target.clientID);states.push(await getState(job,row.kind,actual));}
    const assigned=await job.annotations.group(states,sourceGroup===0);groups.push({source:sourceGroup,assigned});
    const grouped=await job.annotations.export();
    if(rows.some(row=>{const actual=grouped[row.kind].find(t=>t.clientID===row.target.clientID);return !actual||(actual.group||0)!==assigned;}))throw new Error('Native grouping not confirmed');
   }
  }catch(e){error=e.message;}
  finally{try{await env.refresh(job);}catch(e){error=(error?error+'; ':'')+'Render refresh failed: '+e.message;}env.lock(false);running=false;}
  return {success:!error,error,changed,added,removed,groups,saveRequired:true,
   message:error?'Import stopped; earlier native edits may remain. Inspect Undo before retrying.':'Editor updated. Save CVAT to persist; no page reload needed.'};
 }
 return {exported,preview,apply};
}
root.__C3D_ANNOTATION_IO={createAnnotationIO};if(typeof module!=='undefined')module.exports={createAnnotationIO};
})(typeof window!=='undefined'?window:globalThis);
