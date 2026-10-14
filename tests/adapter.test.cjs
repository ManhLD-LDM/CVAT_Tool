const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCvatAdapter}=require('../extension/cvat_adapter.js');
const math=require('../extension/geometry_math.js');
const THREE=require('three');
function harness(options={}) {
    const labels=[{id:7,name:'vehicles',color:'#ff0000'},{id:8,name:'pedestrian',color:'#00ff00'}];
    let dirty=false, fail=false, history=[];
    const makeState=(id,serverId=null)=>({clientID:id,serverID:serverId,objectType:'shape',shapeType:'cuboid',frame:29,label:labels[0],points:[0,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0],lock:false,
        async save(){if(fail)throw new Error('native save failed');dirty=true;history.push(this.clientID);return {...this,points:[...this.points]};}});
    const states=[makeState(1,99),makeState(99,100)];
    const perspective={dispatchEvent(event){if(event.type==='canvas.selected'){state.annotation.annotations.activatedStateID=event.detail.clientID;notify();}}};
    const colors=new Map();
    const view={drawnObjects:Object.fromEntries(states.map(s=>[s.clientID,{data:{clientID:s.clientID,labelColor:s.label.color},cuboid:{setColor(color){colors.set(s.clientID,color);}}}])),receiveShapeColor(s){return s.label?.color||s.labelColor;},views:{}};
    const canvas={activate(){},html:()=>({perspective}),mode:()=>options.mode||'idle',render(){},view};
    const state={annotation:{job:{instance:{id:9426,labels,actions:{get:async()=>history},annotations:{hasUnsavedChanges:()=>dirty}}},player:{frame:{number:29}},annotations:{states,activatedStateID:null},canvas:{instance:canvas},workspace:'standard3d'}};
    const listeners=new Set(),actions=[];
    const notify=()=>listeners.forEach(fn=>fn());
    const store={getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dispatch(action){actions.push(action);if(action.type==='UPDATE_ANNOTATIONS_SUCCESS'){for(const saved of action.payload.states){const index=state.annotation.annotations.states.findIndex(s=>s.clientID===saved.clientID);state.annotation.annotations.states[index]=saved;}notify();}}};
    const win={location:{pathname:'/tasks/2837/jobs/9426'},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}};
    const adapter=createCvatAdapter({window:win,document:{getElementById:()=>null},store,math,delay:async()=>{}});adapter.start();
    const ref=id=>{const s=adapter.getSnapshot();return {sessionId:s.sessionId,jobId:s.jobId,frame:s.frame,revision:s.revision,clientId:id};};
    return {adapter,ref,state,actions,colors,history,notify,failSave:()=>{fail=true;},labels,view};
}
test('selection uses clientID even when another object has the same serverID',async()=>{
    const h=harness();await h.adapter.command('SELECT_OBJECT',{ref:h.ref(99)});assert.equal(h.adapter.getSnapshot().activeBoxId,99);assert.equal(h.actions.length,0);h.adapter.dispose();
});

test('2D jobs cannot receive a 3D mutation',async()=>{
    const h=harness();h.state.annotation.job.instance.dimension='2d';
    assert.equal(h.adapter.getSnapshot().connected,false);
    await assert.rejects(h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90}),/3D/);h.adapter.dispose();
});

test('native Review workspace refuses mutations regardless of enum capitalization',async()=>{
    const h=harness();h.state.annotation.workspace='Review';h.state.annotation.job.instance.dimension='3d';
    await assert.rejects(h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90}),/review/);assert.equal(h.history.length,0);h.adapter.dispose();
});

test('failure after core commit does not falsely roll back already-saved data',async()=>{
    const h=harness();h.state.annotation.job.instance.actions.get=async()=>{throw new Error('history unavailable');};
    await assert.rejects(h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90}),/Core CVAT accepted edit|Core CVAT đã nhận/i);
    assert.equal(h.state.annotation.annotations.states[0].points[5],Math.PI/2);assert.equal(h.actions.length,0);h.adapter.dispose();
});

test('ground reads scene point-cloud transforms then snaps through native save',async()=>{
    const h=harness(),scene=new THREE.Scene(),points=[];
    for(let x=-8;x<8;x+=.35)for(let y=-8;y<8;y+=.35)points.push(x,y,.02*x-.01*y);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());cloud.position.z=.3;scene.add(cloud);
    h.view.views.perspective={scene};
    const grounds=await h.adapter.command('GET_GROUNDS',{ref:h.ref(1),ids:[1]});
    assert.ok(grounds[1].accepted);assert.ok(grounds[1].confidence>=.65);assert.ok(Math.abs(grounds[1].c-.3)<1e-6);
    const result=await h.adapter.command('SNAP_GROUND',{ref:h.ref(1)});
    assert.ok(result.applied);assert.equal(h.history.length,1);
    const clearance=Math.min(...math.cuboidVertices(h.state.annotation.annotations.states[0].points).map(([x,y,z])=>z-(grounds[1].a*x+grounds[1].b*y+grounds[1].c)));
    assert.ok(Math.abs(clearance)<1e-7);h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('rotate uses native save/history + reducer action and marks unsaved',async()=>{
    const h=harness(),before=[...h.state.annotation.annotations.states[0].points];
    const result=await h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90});
    assert.equal(result.applied,true);assert.equal(result.saveState,'unsaved');assert.equal(h.history.length,1);
    const after=h.state.annotation.annotations.states[0].points;assert.deepEqual(after.slice(0,5),before.slice(0,5));assert.deepEqual(after.slice(6),before.slice(6));assert.equal(after[5],Math.PI/2);
    assert.equal(h.actions[0].type,'UPDATE_ANNOTATIONS_SUCCESS');h.adapter.dispose();
});

test('Auto-Fit scans native scene ROI and uses the native save/history pipeline',async()=>{
    const h=harness(),scene=new THREE.Scene(),points=[];
    for(let x=-8;x<=8;x+=.35)for(let y=-8;y<=8;y+=.35)points.push(x,y,0);
    for(let x=-1.8;x<=1.8;x+=.2)for(let y=-.8;y<=.8;y+=.2)for(const z of [.4,1.5])points.push(x,y,z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());cloud.position.z=.1;scene.add(cloud);h.view.views.perspective={scene};
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)});
    assert.ok(result.applied);assert.equal(result.saveState,'unsaved');assert.equal(h.history.length,1);assert.equal(h.actions[0].type,'UPDATE_ANNOTATIONS_SUCCESS');
    const fitted=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.ok(Math.abs(fitted[2]-fitted[8]/2-.1)<1e-6);assert.ok(fitted[6]>=3.5);
    const savedFit=[...fitted];
    h.state.annotation.annotations.states[0].points[5]=.25;h.notify();
    const exported=await h.adapter.command('EXPORT_FIT_CASE',{ref:h.ref(1)});
    assert.equal(exported.schema,'cvat-3d-tool-fit-case/v1');assert.equal(exported.seedBox.points[5],0);
    assert.deepEqual(exported.fittedBox.points,savedFit);assert.equal(exported.currentBox.points[5],.25);
    assert.ok(exported.roiPoints.length>10);assert.ok(exported.groundSupport.length>10);assert.equal(h.history.length,1);
    await assert.rejects(h.adapter.command('EXPORT_FIT_CASE',{ref:h.ref(99)}),/Run Auto-Fit|Chạy Auto-Fit/i);
    h.state.annotation.player.frame.number=30;h.state.annotation.annotations.states[0].frame=30;h.notify();
    await assert.rejects(h.adapter.command('EXPORT_FIT_CASE',{ref:h.ref(1)}),/Run Auto-Fit|Chạy Auto-Fit/i);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});

test('Auto-Fit continues with XY only when native ground support is one-sided',async()=>{
    const h=harness(),scene=new THREE.Scene(),points=[];
    for(let x=1;x<=8;x+=.35)for(let y=1;y<=8;y+=.35)points.push(x,y,0);
    for(let x=-1.8;x<=1.8;x+=.15)for(let y=-.8;y<=.8;y+=.15)points.push(x,y,1.5);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    const before=[...h.state.annotation.annotations.states[0].points];
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)});
    assert.ok(result.applied);assert.equal(result.groundFallback,true);assert.equal(h.history.length,1);
    const after=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;assert.equal(after[2],before[2]);assert.equal(after[8],before[8]);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});

test('repeated ROI requests use cached coordinates and invalidate on cloud transform changes',async()=>{
    const h=harness(),scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();
    const attribute=new THREE.Float32BufferAttribute([0,0,1,.1,0,1],3);geometry.setAttribute('position',attribute);
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    let reads=0;const original=attribute.getX.bind(attribute);attribute.getX=i=>{reads++;return original(i);};
    await h.adapter.extractLocalPoints(h.ref(1));const first=reads;
    await h.adapter.extractLocalPoints(h.ref(1));assert.equal(reads,first);
    cloud.position.x=.1;await h.adapter.extractLocalPoints(h.ref(1));assert.ok(reads>first);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});

test('real 1m seed case is fitted through native adapter with corrected ground and height',async()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box62.json'),h=harness(),scene=new THREE.Scene();
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points=[...data.seedBox.points];h.notify();
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),fitted=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.ok(result.applied);assert.equal(result.groundFallback,false);assert.equal(h.history.length,1);
    assert.ok(fitted[8]>1.75);assert.ok(math.orientedIoU(fitted,data.currentBox.points)>.75);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('real expanded-height regression saves only the vehicle through native adapter',async()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box63.json'),h=harness(),scene=new THREE.Scene();
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points=[...data.seedBox.points];h.notify();
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),fitted=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.ok(result.applied);assert.equal(result.groundFallback,false);assert.equal(h.history.length,1);
    assert.ok(fitted[8]>1.75);assert.ok(math.orientedIoU(fitted,data.currentBox.points)>.7);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('dense parking box32 fits only the seeded vehicle through native adapter',async()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box32.json'),h=harness(),scene=new THREE.Scene();
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points=[...data.seedBox.points];h.notify();
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),fitted=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.ok(result.applied);assert.equal(result.groundFallback,false);assert.equal(h.history.length,1);
    assert.ok(fitted[8]>1.75);assert.ok(fitted[6]>4.3&&fitted[6]<4.9);assert.ok(fitted[7]<2);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('historical compact vehicle regression preserves manual ground snap',async()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box17.json'),h=harness(),scene=new THREE.Scene();
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points=[...data.seedBox.points];h.notify();
    const result=await h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),fitted=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.ok(result.applied);assert.equal(result.groundFallback,true);assert.equal(h.history.length,1);
    assert.ok(fitted[8]>1.75);assert.ok(math.orientedIoU(fitted,data.currentBox.points)>.75);
    const before=[...fitted],snapResult=await h.adapter.command('SNAP_GROUND',{ref:h.ref(1)});
    assert.ok(snapResult.applied);assert.equal(h.history.length,2);
    const after=h.adapter.getSnapshot().boxes.find(b=>b.id===1).points;
    assert.deepEqual(after.slice(3),before.slice(3));
    const g=(await h.adapter.command('GET_GROUNDS',{ref:h.ref(1),ids:[1]}))[1];
    assert.ok(g.confidence<.65);assert.ok(math.canManuallySnapGround(g));
    const expected=math.snapGroundPoints(before,math.makePlane(g.a,g.b,g.c)).newPoints;
    assert.deepEqual(after,expected);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('failed native mutation rejects, restores input, and emits no success action',async()=>{
    const h=harness();h.failSave();await assert.rejects(h.adapter.command('ROTATE',{ref:h.ref(1),degrees:180}),/native save failed/);
    assert.equal(h.state.annotation.annotations.states[0].points[5],0);assert.equal(h.actions.length,0);h.adapter.dispose();
});
test('stale revision, old frame, locked objects and drawing mode refuse edits',async()=>{
    const h=harness(),ref=h.ref(1);h.state.annotation.annotations.states[1].points[0]=5;h.notify();
    await assert.rejects(h.adapter.command('ROTATE',{ref,degrees:90}),/Box modified|thay đổi/i);
    await assert.rejects(h.adapter.command('ROTATE',{ref:{...h.ref(1),frame:28},degrees:90}),/frame/i);
    h.state.annotation.annotations.states[0].lock=true;await assert.rejects(h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90}),/locked|khóa/i);h.adapter.dispose();
    const drawing=harness({mode:'draw'});await assert.rejects(drawing.adapter.command('ROTATE',{ref:drawing.ref(1),degrees:90}),/interaction|vẽ/i);drawing.adapter.dispose();
});
test('adapter snapshot resolves attributes and subType from ObjectState',async()=>{
    const h=harness();
    h.state.annotation.annotations.states[0].label.attributes=[{id:101,name:'type',values:['car','bus','truck']}];
    h.state.annotation.annotations.states[0].attributes={101:'bus'};
    h.notify();
    const snap=h.adapter.getSnapshot();
    assert.equal(snap.boxes[0].attributes.type,'bus');
    assert.equal(snap.boxes[0].subType,'bus');
    h.adapter.dispose();
});
test('new boxes without serverID can change class through native state',async()=>{
    const h=harness();h.state.annotation.annotations.states[0].serverID=null;
    await h.adapter.command('SET_LABEL',{ref:h.ref(1),labelId:8});assert.equal(h.state.annotation.annotations.states[0].label.id,8);assert.equal(h.history.length,1);h.adapter.dispose();
});
test('QC appearance affects exact IDs and restores native label colors',async()=>{
    const h=harness();await h.adapter.command('SET_QC_APPEARANCE',{colors:[{id:1,color:'#fbbf24'}]});
    assert.equal(h.colors.get(1),'#fbbf24');assert.equal(h.colors.get(99),'#ff0000');
    await h.adapter.command('CLEAR_QC_APPEARANCE');assert.equal(h.colors.get(1),'#ff0000');h.adapter.dispose();
});
test('late native result never inserts old-frame states into current frame',async()=>{
    const h=harness();const target=h.state.annotation.annotations.states[0];target.save=async function(){h.state.annotation.player.frame.number=30;return {...this};};
    const result=await h.adapter.command('ROTATE',{ref:h.ref(1),degrees:90});assert.equal(result.previousFrame,true);assert.equal(h.actions.length,0);h.adapter.dispose();
});

test('focus selects exact clientID and frames all vertices while preserving viewing direction',async()=>{
 const h=harness(),camera=new THREE.PerspectiveCamera(50,1.5,.1,1000);
 camera.position.set(20,-30,15);camera.lookAt(0,0,0);
 const direction=camera.getWorldDirection(new THREE.Vector3()),target=new THREE.Vector3();
 h.view.views.perspective={camera,controls:{enabled:true,setLookAt(x,y,z,tx,ty,tz){camera.position.set(x,y,z);target.set(tx,ty,tz);camera.lookAt(target);},update(){}}};
 const before=h.adapter.getSnapshot().boxes[0].points;
 const result=await h.adapter.command('SELECT_OBJECT',{ref:h.ref(1),focus:true});
 assert.equal(result.selected,1);assert.equal(result.focused,true);assert.equal(h.adapter.getSnapshot().activeBoxId,1);
 assert.ok(direction.distanceTo(camera.getWorldDirection(new THREE.Vector3()))<1e-8);
 assert.deepEqual(target.toArray(),before.slice(0,3));
 camera.updateMatrixWorld();
 for(const v of math.cuboidVertices(before)){const projected=new THREE.Vector3(...v).project(camera);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1);}
 assert.equal(h.history.length,0);h.adapter.dispose();
});
