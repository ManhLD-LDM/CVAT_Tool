/* Viewport controls run in MAIN so native camera handlers cannot consume gestures first. */
(function(root){
 'use strict';
 function createViewportTools({win,doc,math,shortcuts,getCanvas,getSnapshot,getContext=getSnapshot,isBusy=()=>false,validate,updateObject,emit}){
  let settings=null,pointer=null,lastTop=null,gesture=null,blockedUntil=0,blockedButton=null,appearance=null;
  const held=new Set(),materials=new Map(),backgrounds=new Map(),events=[];
  const canvas=()=>getCanvas(),views=()=>canvas()?.view?.views||{};
  const stop=e=>{e.preventDefault?.();e.stopImmediatePropagation?.();};
  const notice=message=>emit({error:message});
  function surface(target){return Object.entries(views()).find(([,v])=>v.renderer?.domElement===target)?.[0]||null;}
  function locate(e){const name=surface(e.target);if(!name)return null;const snap=getContext();return {name,x:e.clientX,y:e.clientY,frame:snap.frame,jobId:snap.jobId,clientId:snap.activeBoxId};}
  function validPointer(p){const s=getContext();return p&&p.frame===s.frame&&p.jobId===s.jobId&&p.clientId===s.activeBoxId;}
  function ref(){const s=getSnapshot();return {sessionId:s.sessionId,jobId:s.jobId,frame:s.frame,revision:s.revision,clientId:s.activeBoxId};}
  function current(p=pointer){if(!validPointer(p))throw Error('Hover the current viewport again');const v=views()[p.name],r=v?.renderer?.domElement?.getBoundingClientRect();if(!v?.camera||!r?.width||!r?.height)throw Error('Viewport camera unavailable');if(p.x<r.left||p.x>=r.left+r.width||p.y<r.top||p.y>=r.top+r.height)throw Error('Pointer is outside the viewport');if(doc.elementFromPoint&&doc.elementFromPoint(p.x,p.y)!==v.renderer.domElement)throw Error('Viewport is covered');return {v,r,p};}
  function parent(target,name){return canvas()?.view?.drawnObjects?.[target.clientID]?.cuboid?.[name]?.parent;}
  function ray(target,p){const {v,r}=current(p);v.camera.updateMatrixWorld?.(true);const x=(p.x-r.left)/r.width*2-1,y=1-(p.y-r.top)/r.height*2;
   const a=v.camera.position.clone().set(x,y,-1).unproject(v.camera),b=v.camera.position.clone().set(x,y,1).unproject(v.camera),owner=parent(target,p.name);
   owner?.updateWorldMatrix?.(true,false);owner?.worldToLocal(a);owner?.worldToLocal(b);return {a,b,v,r,owner};}
  function project(target,name,q){const v=views()[name],r=v.renderer.domElement.getBoundingClientRect(),point=v.camera.position.clone().fromArray(q),owner=parent(target,name);owner?.updateWorldMatrix?.(true,false);owner?.localToWorld(point);v.camera.updateMatrixWorld?.(true);point.project(v.camera);return {x:r.left+(point.x+1)*r.width/2,y:r.top+(1-point.y)*r.height/2};}
  function axes(points){const verts=math.cuboidVertices([0,0,0,...points.slice(3,6),2,2,2]);return [4,2,1].map(i=>verts[i].map((v,j)=>(v-verts[0][j])/2));}
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  function topPosition(target,p){if(p?.name!=='top')throw Error('Move to mouse requires Top view; use M in 3D to aim Top view first');const {a,b}=ray(target,p);const d=b.clone().sub(a);if(Math.abs(d.z)<1e-9)throw Error('Top view cannot project onto the box center plane');return a.addScaledVector(d,(target.points[2]-a.z)/d.z);}
  async function moveToMouse(payload){const {target}=validate(payload.ref,true),p=payload.pointer||pointer||lastTop,points=Array.from(target.points),at=topPosition(target,p);points[0]=at.x;points[1]=at.y;return updateObject(payload.ref,{points});}
  async function cornerToMouse(payload){const {target}=validate(payload.ref,true),p=payload.pointer||pointer;if(!['top','side','front'].includes(p?.name))throw Error('Corner placement requires Top, Side or Front view');
   const points=Array.from(target.points),basis=axes(points),visible=p.name==='top'?[0,1]:p.name==='side'?[0,2]:[1,2],hidden=[0,1,2].find(i=>!visible.includes(i));
   const verts=math.cuboidVertices(points);let index=0,distance=Infinity;verts.forEach((q,i)=>{const s=project(target,p.name,q),d=(s.x-p.x)**2+(s.y-p.y)**2;if(d<distance){distance=d;index=i;}});
   const signs=[index&4?1:-1,index&2?1:-1,index&1?1:-1],{a,b}=ray(target,p),d=b.clone().sub(a),normal=basis[hidden],center=points.slice(0,3),den=dot(normal,d.toArray());if(Math.abs(den)<1e-9)throw Error('Cannot project corner onto this view');
   // Intersect the ray with the plane through the chosen corner, parallel to the visible box axes.
   const corner=verts[index],t=dot(normal,corner.map((v,i)=>v-a.getComponent(i)))/den,at=a.addScaledVector(d,t).toArray(),local=basis.map(axis=>dot(axis,at.map((v,i)=>v-center[i]))),shift=[0,0,0];
   for(const axis of visible){const opposite=-signs[axis]*points[6+axis]/2,extent=signs[axis]*(local[axis]-opposite);if(extent<.1)throw Error('Corner cannot cross the opposite corner; minimum size is 0.1 m');points[6+axis]=extent;shift[axis]=(local[axis]+opposite)/2;}
   for(let i=0;i<3;i++)points[i]+=basis.reduce((sum,axis,j)=>sum+axis[i]*shift[j],0);
   return updateObject(payload.ref,{points});
  }
  function aimTop(p){const {v,r}=current(p),top=views().top;if(p.name!=='perspective'||!top?.camera)throw Error('Aim Top view from the 3D viewport');
   const raycaster=v.rayCaster?.renderer||v.raycaster;if(!raycaster?.setFromCamera)throw Error('CVAT point-cloud raycaster unavailable');
   const mouse={x:(p.x-r.left)/r.width*2-1,y:1-(p.y-r.top)/r.height*2};v.camera.updateMatrixWorld?.(true);
   raycaster.setFromCamera(mouse,v.camera);const clouds=[];v.scene?.traverse?.(o=>{if(o.isPoints&&o.visible!==false)clouds.push(o);});
   const hits=raycaster.intersectObjects(clouds,false);if(!hits.length)throw Error('No LiDAR point under the cursor; aim at a visible point');
   const point=hits[0].point,cam=top.camera,controls=top.controls,old=cam.position.clone();
   const target=typeof controls?.getTarget==='function'?controls.getTarget(old.clone(),false):controls?.target?.clone?.()||old.clone().set(0,0,0).unproject(cam);
   const offset=old.sub(target),next=point.clone().add(offset);
   if(controls?.setLookAt){controls.setLookAt(next.x,next.y,next.z,point.x,point.y,point.z,false);controls.update?.(0);}
   else {cam.position.copy(next);controls?.target?.copy(point);cam.lookAt(point);controls?.update?.();}
   cam.updateMatrixWorld?.(true);canvas().render?.();showMarker(p);return {aimed:true,message:'Top view aimed · move into Top view and use Move to mouse'};
  }
  let marker=null,markerTimer=null;
  function showMarker(p){if(!doc.createElement)return;marker?.remove();win.clearTimeout?.(markerTimer);marker=doc.createElement('div');marker.className='c3d-aim-marker';marker.style.cssText=`position:fixed;left:${p.x-9}px;top:${p.y-9}px;width:18px;height:18px;border:2px solid #60a5fa;border-radius:50%;pointer-events:none;z-index:2147483646`;doc.body?.append(marker);markerTimer=win.setTimeout?.(()=>{marker?.remove();marker=null;},900);}
  function restoreGesture(){if(!gesture)return;const g=gesture;gesture=null;for(const [mesh,z] of g.meshes){mesh.rotation.z=z;mesh.updateMatrixWorld?.(true);}if(g.controls)g.controls.enabled=g.enabled;canvas()?.render?.();}
  function begin(p,binding){if(isBusy())throw Error('Previous operation or save/reload in progress');const reference=ref(),{target}=validate(reference,true),{v}=current(p);if(p.name!=='perspective')return false;
   const meshes=Object.values(canvas().view.drawnObjects?.[target.clientID]?.cuboid||{}).filter(o=>o?.isObject3D&&o.rotation),center=project(target,'perspective',target.points.slice(0,3));
   if(Math.hypot(p.x-center.x,p.y-center.y)<8)throw Error('Start rotation away from the projected box center');
   gesture={ref:reference,points:Array.from(target.points),center,last:Math.atan2(p.y-center.y,p.x-center.x),angle:0,meshes:meshes.map(m=>[m,m.rotation.z]),controls:v.controls,enabled:v.controls?.enabled,binding};if(v.controls)v.controls.enabled=false;return true;
  }
  function gestureValid(){if(!gesture)return false;try{if(isBusy())throw Error('Operation in progress');validate(gesture.ref,true);const s=getSnapshot();if(s.activeBoxId!==gesture.ref.clientId)throw Error('Selection changed');return true;}catch(_){restoreGesture();return false;}}
  function drag(e){if(!gestureValid())return;const g=gesture,dx=e.clientX-g.center.x,dy=e.clientY-g.center.y;if(Math.hypot(dx,dy)<8)return;const angle=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(angle-g.last),Math.cos(angle-g.last));g.last=angle;
   // Looking from below reverses the screen orientation of world Z.
   const camera=views().perspective.camera,worldZ=camera.position.z-(canvas().view.drawnObjects?.[g.ref.clientId]?.cuboid?.perspective?.getWorldPosition?.(camera.position.clone())?.z??g.points[2]);g.angle+=(worldZ>=0?-1:1)*delta;
   for(const [mesh,z] of g.meshes){mesh.rotation.z=z+g.angle;mesh.updateMatrixWorld?.(true);}canvas().render?.();stop(e);
  }
  async function end(e){if(!gesture){block(e);return;}if(e.button!==Number(gesture.binding.code.slice(5)))return;if(!gestureValid())return;stop(e);blockedUntil=Date.now()+650;blockedButton=e.button;const g=gesture;restoreGesture();if(Math.abs(g.angle)<1e-8)return;const points=g.points.slice();points[5]+=g.angle;try{await updateObject(g.ref,{points});}catch(error){notice(error.message);}}
  function allowed(e){return settings&&!e.isComposing&&!e.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog,#cvat-3d-copilot-root')&&!doc.querySelector?.('[role="dialog"],dialog[open]');}
  function input(e){if(e.type==='keydown'){if(e.code==='Escape'&&gesture){stop(e);restoreGesture();return;}if(shortcuts.fromEvent(e))held.add(e.code);}
   if(!allowed(e)||e.repeat)return;
   const p=locate(e)||pointer;if(!validPointer(p))return;
   if(e.type==='keydown'&&shortcuts.definitions.some(d=>settings.bindings[d.id]?.hold===e.code&&(d.id!=='ROTATE_DRAG'||p.name==='perspective')&&(d.id!=='CORNER_TO_MOUSE'||['top','side','front'].includes(p.name)))){stop(e);return;}
   const hold=[...held].filter(k=>k!==e.code).at(-1),pressed=shortcuts.fromEvent(e,/^(pointerdown|wheel)$/.test(e.type)?hold:undefined);
   if(!pressed)return;const match=shortcuts.definitions.find(d=>shortcuts.signature(settings.bindings[d.id])===shortcuts.signature(pressed));if(!match)return;
   if(match.id==='CORNER_TO_MOUSE'&&!['top','side','front'].includes(p.name)||match.id==='ROTATE_DRAG'&&p.name!=='perspective'||match.id==='MOVE_TO_MOUSE'&&!['top','perspective'].includes(p.name))return;
   if(getSnapshot().freeCam&&['CORNER_TO_MOUSE','ROTATE_DRAG'].includes(match.id))return;
   pointer=p;try{if(match.gesture){if(!begin(p,settings.bindings[match.id]))return;}else emit({action:match.id,pointer:p});stop(e);if(e.type==='pointerdown'){blockedUntil=Date.now()+650;blockedButton=e.button;}}catch(error){notice(error.message);stop(e);}
  }
  function move(e){const p=locate(e);pointer=p;if(p?.name==='top')lastTop=p;else if(p)lastTop=null;if(gesture)drag(e);}
  function up(e){held.delete(e.code);if(gesture?.binding.hold===e.code)restoreGesture();}
  function block(e){if(surface(e.target)&&(Date.now()<blockedUntil&&e.button===blockedButton||gesture&&e.button===Number(gesture.binding.code.slice(5))))stop(e);}
  function blur(){held.clear();pointer=null;lastTop=null;restoreGesture();}
  function tick(){if(gesture)gestureValid();applyAppearance();}
  function configure(raw){restoreGesture();settings=shortcuts.normalize(raw);appearance={background:settings.background,follow:settings.projectionFollow,size:settings.projectionSize};applyAppearance();return {configured:true};}
  function applyAppearance(){if(!appearance)return;let changed=false;const livePoints=new Set(),liveScenes=new Set();for(const [name,v] of Object.entries(views())){
   if(!v.scene)continue;
   liveScenes.add(v.scene);
   const desired=appearance.background;
   if(desired&&!backgrounds.has(v.scene))backgrounds.set(v.scene,v.scene.background?.clone?.()||v.scene.background);
   if(desired&&v.scene.background?.set&&v.scene.background.getHexString?.()!==desired.slice(1)){v.scene.background=v.scene.background.clone();v.scene.background.set(desired);changed=true;}
   if(!desired&&backgrounds.has(v.scene)){v.scene.background=backgrounds.get(v.scene);backgrounds.delete(v.scene);changed=true;}
   if(name==='perspective')continue;
   v.scene.traverse?.(o=>{if(!o.isPoints||!o.material?.clone)return;livePoints.add(o);let record=materials.get(o);if(record&&o.material!==record.clone){record.clone.dispose?.();materials.delete(o);record=null;}if(appearance.follow){if(record){o.material=record.original;record.clone.dispose?.();materials.delete(o);changed=true;}return;}if(!record){record={original:o.material,clone:o.material.clone()};materials.set(o,record);o.material=record.clone;changed=true;}if(o.material.size!==appearance.size||o.material.sizeAttenuation!==false){o.material.size=appearance.size;o.material.sizeAttenuation=false;o.material.needsUpdate=true;changed=true;}});
  }for(const [o,r] of materials)if(!livePoints.has(o)){if(o.material===r.clone)o.material=r.original;r.clone.dispose?.();materials.delete(o);}for(const scene of backgrounds.keys())if(!liveScenes.has(scene))backgrounds.delete(scene);if(changed)canvas()?.render?.();}
  function dispose(){blur();marker?.remove();win.clearTimeout?.(markerTimer);for(const [type,fn,opts] of events)win.removeEventListener?.(type,fn,opts);for(const [o,r] of materials){if(o.material===r.clone)o.material=r.original;r.clone.dispose?.();}materials.clear();for(const [s,b] of backgrounds)s.background=b;backgrounds.clear();}
  function start(){for(const [type,fn] of [['keydown',input],['keyup',up],['pointerdown',input],['wheel',input],['pointermove',move],['pointerup',end],['pointercancel',blur],['blur',blur],['contextmenu',block],['auxclick',block],['click',block]]){const opts={capture:true,passive:false};events.push([type,fn,opts]);win.addEventListener?.(type,fn,opts);}}
  return {start,dispose,configure,tick,moveToMouse,cornerToMouse,topPosition,aimTop,clearPointer:blur,get pointer(){return pointer;},get lastTop(){return validPointer(lastTop)?lastTop:null;}};
 }
 root.__C3D_CREATE_VIEWPORT_TOOLS=createViewportTools;
 if(typeof module!=='undefined'&&module.exports)module.exports={createViewportTools};
})(typeof window!=='undefined'?window:globalThis);
