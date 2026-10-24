const {test}=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const {createViewportTools}=require('../extension/viewport_tools.js'),shortcuts=require('../extension/shortcut_settings.js'),math=require('../extension/geometry_math.js');
function fixture({busy=false}={}){
 const events={},messages=[],history=[],points=[0,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0],snap={sessionId:'test',jobId:1,frame:0,revision:1,activeBoxId:1,freeCam:false},target={clientID:1,points},views={},cuboid={};
 for(const name of ['perspective','top','side','front']){const camera=name==='perspective'?new THREE.PerspectiveCamera(60,1,.1,100):new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(...({perspective:[0,0,20],top:[0,0,20],side:[0,-20,1],front:[20,0,1]}[name]));camera.up.set(0,0,1);if(['perspective','top'].includes(name))camera.up.set(0,1,0);camera.lookAt(0,0,1);camera.updateProjectionMatrix();camera.updateMatrixWorld();const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.position.set(0,0,1);mesh.scale.set(4,2,2);scene.add(mesh);cuboid[name]=mesh;
  const el={name,getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})},controls={enabled:true,target:new THREE.Vector3(0,0,1),update(){}};views[name]={camera,scene,controls,renderer:{domElement:el},rayCaster:{renderer:new THREE.Raycaster()}};
 }
 const canvas={view:{views,drawnObjects:{1:{cuboid}}},render(){}};
 function validate(ref){if(ref.sessionId!==snap.sessionId||ref.frame!==snap.frame)throw Error('frame changed');if(ref.revision!==snap.revision)throw Error('modified');if(target.lock)throw Error('locked');return {target};}
 const win={addEventListener(type,fn){events[type]=fn;},removeEventListener(type){delete events[type];},clearTimeout(){}};
 const tools=createViewportTools({win,doc:{},math,shortcuts,getCanvas:()=>canvas,getSnapshot:()=>snap,isBusy:()=>busy,validate,async updateObject(ref,change){validate(ref);target.points=change.points;history.push(change.points);snap.revision++;return {applied:true};},emit:data=>messages.push(data)});tools.start();tools.configure(shortcuts.defaults());
 const reference=()=>({sessionId:snap.sessionId,jobId:1,frame:snap.frame,revision:snap.revision,clientId:1});
 function event(type,name='top',extra={}){const e={type,target:views[name].renderer.domElement,clientX:200,clientY:200,button:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};events[type]?.(e);return e;}
 return {tools,views,cuboid,target,snap,history,messages,event,reference,setBusy(value){busy=value;}};
}
test('M dispatch depends on hovered viewport; E is projection-only; unbound inputs remain native',()=>{
 const h=fixture();h.event('pointermove','perspective');assert.equal(h.event('keydown','perspective',{code:'KeyM'}).prevented,true);assert.equal(h.messages[0].pointer.name,'perspective');h.event('keyup','perspective',{code:'KeyM'});
 h.event('pointermove','top');h.event('keydown','top',{code:'KeyM'});assert.equal(h.messages[1].pointer.name,'top');h.event('keyup','top',{code:'KeyM'});
 h.event('pointermove','side');assert.equal(h.event('keydown','side',{code:'KeyM'}).prevented,undefined);h.event('keyup','side',{code:'KeyM'});h.event('keydown','side',{code:'KeyE'});assert.equal(h.messages.at(-1).action,'CORNER_TO_MOUSE');
 assert.equal(h.event('pointerdown','top',{button:2}).prevented,undefined);h.tools.dispose();
});
test('mouse, wheel and held-key bindings consume only matching native events',()=>{
 const h=fixture(),settings=shortcuts.defaults();shortcuts.assign(settings,'MOVE_TO_MOUSE',shortcuts.fromEvent({type:'pointerdown',button:3}));shortcuts.assign(settings,'SNAP_GROUND',shortcuts.fromEvent({type:'wheel',deltaY:-1},'KeyT'));h.tools.configure(settings);h.event('pointermove');
 assert.equal(h.event('pointerdown','top',{button:3}).prevented,true);assert.equal(h.event('auxclick','top',{button:3}).prevented,true);assert.equal(h.event('click','top',{button:0}).prevented,undefined);
 h.event('keydown','top',{code:'KeyT'});assert.equal(h.event('wheel','top',{deltaY:-30}).prevented,true);assert.equal(h.messages.at(-1).action,'SNAP_GROUND');h.event('keyup','top',{code:'KeyT'});assert.equal(h.event('wheel','top',{deltaY:-30}).prevented,undefined);h.tools.dispose();
});
test('exact Top placement preserves all other coordinates and rejects stale pointer',async()=>{
 const h=fixture();h.event('pointermove','top',{clientX:300,clientY:160});await h.tools.moveToMouse({ref:h.reference()});assert.ok(Math.abs(h.target.points[0]-2.5)<1e-8);assert.ok(Math.abs(h.target.points[1]-1)<1e-8);assert.deepEqual(h.target.points.slice(2),[1,0,0,0,4,2,2,0,0,0,0,0,0,0]);
 h.snap.frame++;await assert.rejects(h.tools.moveToMouse({ref:h.reference()}),/Hover/);h.tools.dispose();
});
for(const name of ['top','side','front'])test('nearest corner resize preserves opposite corner in '+name,async()=>{
 const h=fixture(),camera=h.views[name].camera,visible=name==='top'?[0,1]:name==='side'?[0,2]:[1,2],before=h.target.points.slice(),corner=[2,1,2],cursor=corner.slice();for(const axis of visible)cursor[axis]+=.5;const screen=new THREE.Vector3(...cursor).project(camera),x=(screen.x+1)*200,y=(1-screen.y)*200;
 h.event('pointermove',name,{clientX:x,clientY:y});await h.tools.cornerToMouse({ref:h.reference()});const after=h.target.points;
 for(const axis of visible){assert.ok(Math.abs(after[axis]-(before[axis]+.25))<1e-6);assert.ok(Math.abs(after[6+axis]-(before[6+axis]+.5))<1e-6);assert.ok(Math.abs((after[axis]-after[6+axis]/2)-(before[axis]-before[6+axis]/2))<1e-6);}
 const hidden=[0,1,2].find(i=>!visible.includes(i));assert.equal(after[hidden],before[hidden]);assert.equal(after[hidden+6],before[hidden+6]);assert.deepEqual(after.slice(3,6),before.slice(3,6));h.tools.dispose();
});
test('circular rotation previews and commits once, while Escape and frame changes restore meshes',async()=>{
 const h=fixture();h.event('pointermove','perspective',{clientX:250,clientY:200});h.event('keydown','perspective',{code:'KeyR'});assert.equal(h.event('pointerdown','perspective',{clientX:250}).prevented,true);assert.equal(h.views.perspective.controls.enabled,false);
 h.event('pointermove','perspective',{clientX:200,clientY:250});assert.ok(Math.abs(h.cuboid.perspective.rotation.z+Math.PI/2)<1e-6);h.event('pointerup','perspective',{clientX:200,clientY:250});await Promise.resolve();assert.equal(h.history.length,1);assert.ok(Math.abs(h.target.points[5]+Math.PI/2)<1e-6);assert.equal(h.views.perspective.controls.enabled,true);
 h.event('pointermove','perspective',{clientX:250});h.event('pointerdown','perspective',{clientX:250});h.event('pointermove','perspective',{clientX:200,clientY:250});h.event('keydown','perspective',{code:'Escape'});assert.equal(h.cuboid.perspective.rotation.z,0);assert.equal(h.history.length,1);
 h.event('pointerdown','perspective',{clientX:250});h.snap.frame++;h.tools.tick();assert.equal(h.views.perspective.controls.enabled,true);assert.equal(h.history.length,1);h.tools.dispose();
});
test('3D aiming moves Top camera without editing geometry',()=>{
 const h=fixture(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,4],3));h.views.perspective.scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.event('pointermove','perspective');const result=h.tools.aimTop(h.tools.pointer);assert.equal(result.aimed,true);assert.equal(h.history.length,0);assert.ok(Math.abs(h.views.top.controls.target.z-4)<1e-6);h.tools.dispose();
});
test('appearance clones shared projection materials, restores native changes and backgrounds',()=>{
 const h=fixture(),shared=new THREE.PointsMaterial({size:2});for(const view of Object.values(h.views)){view.scene.background=new THREE.Color('#000000');view.scene.add(new THREE.Points(new THREE.BufferGeometry(),shared));}
 h.tools.configure({...shortcuts.defaults(),background:'#123456',projectionFollow:false,projectionSize:24});for(const [name,view] of Object.entries(h.views)){const points=view.scene.children.find(o=>o.isPoints);assert.equal(view.scene.background.getHexString(),'123456');assert.equal(points.material.size,name==='perspective'?2:24);if(name!=='perspective')assert.notEqual(points.material,shared);}
 shared.size=5;h.tools.configure(shortcuts.defaults());for(const view of Object.values(h.views)){assert.equal(view.scene.background.getHexString(),'000000');assert.equal(view.scene.children.find(o=>o.isPoints).material,shared);}h.tools.dispose();assert.equal(Object.keys(h.views).length,4);
});
test('rotation cannot bypass a pending operation or save/reload hold',()=>{
 const h=fixture({busy:true});h.event('pointermove','perspective',{clientX:250});h.event('keydown','perspective',{code:'KeyR'});h.event('pointerdown','perspective',{clientX:250});assert.match(h.messages.at(-1).error,/save\/reload/);assert.equal(h.views.perspective.controls.enabled,true);
 h.setBusy(false);h.event('pointerdown','perspective',{clientX:250});assert.equal(h.views.perspective.controls.enabled,false);h.setBusy(true);h.tools.tick();assert.equal(h.views.perspective.controls.enabled,true);assert.equal(h.history.length,0);h.tools.dispose();
});
