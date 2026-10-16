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
    const events={};
    const win={location:{pathname:'/tasks/2837/jobs/9426'},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setInterval:()=>1,clearInterval(){},addEventListener(type,fn){events[type]=fn;},removeEventListener(type){delete events[type];}};
    const adapter=createCvatAdapter({window:win,document:{getElementById:()=>null},store,math,delay:async()=>{},...options.adapterEnv});adapter.start();
    const ref=id=>{const s=adapter.getSnapshot();return {sessionId:s.sessionId,jobId:s.jobId,frame:s.frame,revision:s.revision,clientId:id};};
    return {adapter,ref,state,actions,colors,history,notify,failSave:()=>{fail=true;},labels,view,events};
}

function topHarness(options={}){
    const h=harness(options),camera=new THREE.OrthographicCamera(-10,10,5,-5,.1,100);
    camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const rect={left:100,top:200,width:800,height:400};
    const element={getBoundingClientRect:()=>rect};
    h.view.views.top={camera,renderer:{domElement:element}};
    const hover=(x=700,y=300)=>h.events.pointermove({target:element,clientX:x,clientY:y});
    return {...h,camera,rect,element,hover};
}

function adjustmentHarness({occluded=false,weakGround=false,bodyTop}={}){
    const h=harness(),scene=new THREE.Scene(),coordinates=[];
    h.state.annotation.annotations.states[1].points[0]=30;
    if(!weakGround)for(let x=-9;x<=9;x+=.3)for(let y=-9;y<=9;y+=.3)coordinates.push(x,y,0);
    const xmin=occluded?-.8:-1.93,xmax=occluded?.8:2.2,ymin=occluded?-.4:-.95,ymax=occluded?.4:1.1,top=bodyTop??(occluded?1.3:1.94);
    for(let i=0;i<=40;i++)for(let j=0;j<=20;j++){
        const x=xmin+(xmax-xmin)*i/40,y=ymin+(ymax-ymin)*j/20;coordinates.push(x,y,top);
        if(i===0||i===40||j===0||j===20)for(let z=.15;z<top;z+=.15)coordinates.push(x,y,z);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};
    return h;
}

test('Auto Adjust saves one fixed-heading grounded edit and skips a repeat that has no correction',async()=>{
    const h=adjustmentHarness(),before=h.adapter.getSnapshot().boxes[0].points;
    const result=await h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)}),after=h.adapter.getSnapshot().boxes[0].points;
    assert.equal(result.applied,true);assert.equal(h.history.length,1);assert.deepEqual(after.slice(3,6),before.slice(3,6));
    assert.ok(after[6]>before[6]);assert.ok(after[7]>before[7]);assert.ok(after[8]<before[8]&&after[8]>=before[8]-.1);
    assert.ok(Math.abs(after[2]-after[8]/2)<1e-6);
    const repeat=await h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)});assert.equal(repeat.unchanged,true);assert.equal(h.history.length,1);h.adapter.dispose();
});

test('Auto Adjust preserves distant unsupported faces without creating a keyframe',async()=>{
    const h=adjustmentHarness({occluded:true}),before=h.adapter.getSnapshot().boxes[0].points.slice();
    const result=await h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)});
    assert.equal(result.unchanged,true);assert.match(result.warning,/nearby surface/);assert.equal(h.history.length,0);assert.deepEqual(h.adapter.getSnapshot().boxes[0].points,before);h.adapter.dispose();
});

test('Auto Adjust native adapter applies configured height limit through final ground correction',async()=>{
    for(const [options,expectedHeight] of [[{},2],[{maxShrinkDistance:.3,maxShrinkPercent:20},1.83],[{maxShrinkDistance:0,maxShrinkPercent:20},2]]){
        const h=adjustmentHarness({bodyTop:1.8});
        await h.adapter.command('AUTO_ADJUST',{ref:h.ref(1),...options});
        const after=h.adapter.getSnapshot().boxes[0].points;
        assert.ok(Math.abs(after[8]-expectedHeight)<1e-5);assert.equal(h.history.length,1);h.adapter.dispose();
    }
    const h=adjustmentHarness();await assert.rejects(h.adapter.command('AUTO_ADJUST',{ref:h.ref(1),maxShrinkDistance:4}),/Shrink limits/);assert.equal(h.history.length,0);h.adapter.dispose();
});

test('Auto Adjust refuses weak ground, locked boxes and review mode without a native save',async()=>{
    const h=adjustmentHarness({weakGround:true});
    await assert.rejects(h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)}),/ground/i);
    h.state.annotation.annotations.states[0].lock=true;
    await assert.rejects(h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)}),/locked/);
    h.state.annotation.annotations.states[0].lock=false;h.state.annotation.job.instance.dimension='3d';h.state.annotation.workspace='Review';
    await assert.rejects(h.adapter.command('AUTO_ADJUST',{ref:h.ref(1)}),/review/);assert.equal(h.history.length,0);h.adapter.dispose();
});
test('mouse placement maps camera pan, zoom, resize and transformed top copy to native coordinates',async()=>{
    const h=topHarness();
    h.camera.position.x=10;h.camera.position.y=4;h.camera.zoom=2;h.camera.updateProjectionMatrix();
    h.rect.width=400;h.rect.height=200;
    const parent=new THREE.Group();parent.position.set(2,3,0);parent.rotation.z=.3;
    h.view.drawnObjects[1].cuboid.top=new THREE.Object3D();parent.add(h.view.drawnObjects[1].cuboid.top);
    const seed=h.state.annotation.annotations.states[0].points.slice();seed[3]=.15;seed[5]=.7;h.state.annotation.annotations.states[0].points=seed;
    h.hover(400,250);
    const expected=parent.worldToLocal(new THREE.Vector3(12.5,5.25,1));
    const result=await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)});
    const actual=h.adapter.getSnapshot().boxes[0].points;
    assert.ok(Math.abs(actual[0]-expected.x)<1e-8);assert.ok(Math.abs(actual[1]-expected.y)<1e-8);
    assert.deepEqual(actual.slice(2),seed.slice(2));assert.equal(result.groundFallback,true);assert.equal(h.history.length,1);h.adapter.dispose();
});
test('mouse placement estimates destination ground, preserving rotation and size in one native save',async()=>{
    const h=topHarness(),scene=new THREE.Scene(),coordinates=[];
    for(let x=-10;x<=15;x+=.3)for(let y=-10;y<=10;y+=.3)coordinates.push(x,y,.02*x+.1);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};
    const before=h.adapter.getSnapshot().boxes[0].points;h.hover();
    const result=await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),after=h.adapter.getSnapshot().boxes[0].points;
    assert.equal(result.groundFallback,false);assert.ok(Math.abs(after[0]-5)<1e-8);assert.ok(Math.abs(after[1]-2.5)<1e-8);
    const clearance=Math.min(...math.cuboidVertices(after).map(([x,y,z])=>z-(.02*x+.1)));
    assert.ok(Math.abs(clearance)<1e-6);assert.deepEqual(after.slice(3),before.slice(3));assert.equal(h.history.length,1);h.adapter.dispose();
});

for(const adjustDirection of [false,true])test(`mouse placement refines center and final ground in one save; direction option ${adjustDirection}`,async()=>{
    const h=topHarness(),scene=new THREE.Scene(),coordinates=[],yaw=.35,c=Math.cos(yaw),s=Math.sin(yaw);
    for(let x=-10;x<=15;x+=.3)for(let y=-10;y<=10;y+=.3)coordinates.push(x,y,.02*x+.1);
    for(let i=0;i<=24;i++)for(let j=0;j<=12;j++)for(const z of [.8,1,1.2,1.4]){
        const x=(i/24-.5)*2.6,y=(j/12-.5)*1.2;coordinates.push(5.6+c*x-s*y,2.8+s*x+c*y,z);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points[5]=.2;
    const before=h.adapter.getSnapshot().boxes[0].points;h.hover();
    const result=await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1),adjustDirection}),after=h.adapter.getSnapshot().boxes[0].points;
    assert.equal(result.refined,true);assert.equal(result.groundFallback,false);
    assert.ok(Math.abs(after[0]-5.6)<.07);assert.ok(Math.abs(after[1]-2.8)<.07);
    assert.equal(result.directionAdjusted,adjustDirection);
    if(adjustDirection)assert.ok(Math.abs(after[5]-yaw)<.04);else assert.equal(after[5],before[5]);
    assert.deepEqual(after.slice(3,5),before.slice(3,5));assert.deepEqual(after.slice(6),before.slice(6));assert.equal(h.history.length,1);
    const clearance=Math.min(...math.cuboidVertices(after).map(([x,y,z])=>z-(.02*x+.1)));assert.ok(Math.abs(clearance)<1e-6);h.adapter.dispose();
});
test('mouse placement drops stale pointer and refuses locked, busy, drawing and review edits',async()=>{
    const h=topHarness();
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/Hover/);
    h.hover();h.events.pointerout({target:h.element});await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/Hover/);
    h.hover();h.events.blur();await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/Hover/);
    h.hover();h.state.annotation.player.frame.number=30;h.adapter.getSnapshot();h.state.annotation.player.frame.number=29;h.adapter.getSnapshot();
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/Hover/);
    h.hover();const old=h.ref(1);h.state.annotation.annotations.states[0].points[0]+=1;
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:old}),/modified/);
    h.state.annotation.annotations.states[0].lock=true;
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/locked/);
    h.state.annotation.annotations.states[0].lock=false;h.state.annotation.job.instance.dimension='3d';h.state.annotation.workspace='Review';
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/review/);
    assert.equal(h.history.length,0);h.adapter.dispose();
    const drawing=topHarness({mode:'draw'});drawing.hover();await assert.rejects(drawing.adapter.command('MOVE_TO_MOUSE',{ref:drawing.ref(1)}),/drawing/);drawing.adapter.dispose();
});

test('large destination ground adjustment falls back to XY and preserves exact Z',async()=>{
    const h=topHarness({adapterEnv:{math:{...math,GroundIndex:class{estimate(){return {a:0,b:0,c:10,accepted:true,confidence:1};}}}}});
    const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,10],3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};h.hover();
    const before=h.adapter.getSnapshot().boxes[0].points;
    const result=await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)});
    assert.match(result.warning,/1.5m/);assert.deepEqual(h.adapter.getSnapshot().boxes[0].points.slice(2),before.slice(2));h.adapter.dispose();
});

test('track placement delegates current-frame keyframe creation to native save once',async()=>{
    const h=topHarness(),target=h.state.annotation.annotations.states[0];target.objectType='track';target.keyframe=false;
    const before=target.points.slice(),keyframes={0:[...before]},undo=[];let redo;
    target.save=async function(){undo.push(before.slice());redo=this.points.slice();keyframes[29]=this.points.slice();return {...this,keyframe:true};};
    h.hover();await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)});
    const fitted=h.adapter.getSnapshot().boxes[0].points.slice();
    assert.equal(undo.length,1);assert.equal(h.actions.length,1);assert.equal(h.actions[0].type,'UPDATE_ANNOTATIONS_SUCCESS');assert.equal(h.adapter.getSnapshot().boxes[0].keyframe,true);
    assert.deepEqual(keyframes[0],before);assert.deepEqual(keyframes[29],fitted);assert.deepEqual(undo.pop(),before);assert.deepEqual(redo,fitted);h.adapter.dispose();
});

test('frame change during cloud read discards placement before any native save',async()=>{
    let h;
    h=topHarness({adapterEnv:{delay:async()=>{h.state.annotation.player.frame.number=30;h.adapter.getSnapshot();}}});
    const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(32769*3),3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};h.hover();
    await assert.rejects(h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1)}),/frame changed/i);assert.equal(h.history.length,0);h.adapter.dispose();
});
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

test('preset Auto-Fit refuses one-sided weak ground without native edits',async()=>{
    const h=harness(),scene=new THREE.Scene(),points=[];
    for(let x=1;x<=8;x+=.35)for(let y=1;y<=8;y+=.35)points.push(x,y,0);
    for(let x=-1.8;x<=1.8;x+=.15)for(let y=-.8;y<=.8;y+=.15)points.push(x,y,1.5);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    const before=[...h.state.annotation.annotations.states[0].points];
    await assert.rejects(h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),/Reliable ground/);
    assert.equal(h.history.length,0);
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
    assert.deepEqual(fitted.slice(6,9),[4.5,1.8,1.5]);assert.ok(Math.hypot(fitted[0]-data.currentBox.points[0],fitted[1]-data.currentBox.points[1])<.8);
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
    assert.deepEqual(fitted.slice(6,9),[4.5,1.8,1.5]);assert.ok(Math.hypot(fitted[0]-data.currentBox.points[0],fitted[1]-data.currentBox.points[1])<.8);
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
    assert.deepEqual(fitted.slice(6,9),[4.5,1.8,1.5]);assert.ok(Math.hypot(fitted[0]-3.115,fitted[1]+10.489)<.3);
    h.adapter.dispose();geometry.dispose();cloud.material.dispose();
});
test('historical compact vehicle regression preserves manual ground snap',async()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box17.json'),h=harness(),scene=new THREE.Scene();
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const cloud=new THREE.Points(geometry,new THREE.PointsMaterial());scene.add(cloud);h.view.views.perspective={scene};
    h.state.annotation.annotations.states[0].points=[...data.seedBox.points];h.notify();
    const before=[...h.state.annotation.annotations.states[0].points];
    await assert.rejects(h.adapter.command('AUTO_FIT',{ref:h.ref(1)}),/Reliable ground/);
    assert.equal(h.history.length,0);
    const snapResult=await h.adapter.command('SNAP_GROUND',{ref:h.ref(1)});
    assert.ok(snapResult.applied);assert.equal(h.history.length,1);
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

test('batch commands use native unsaved collection and protect clientID keyframes',async()=>{
 const {createBatchController}=require('../extension/batch_controller.js'),batchMath=require('../extension/batch_math.js');
 const h=harness({adapterEnv:{batchFactory:createBatchController,batchMath,parsePCD:b=>new Float32Array(b)}});
 const job=h.state.annotation.job.instance;job.startFrame=0;job.stopFrame=50;
 h.state.annotation.annotations.states[0].objectType='track';
 job.annotations.export=async()=>({tracks:[{clientID:1,id:99,shapes:[{frame:29,points:h.state.annotation.annotations.states[0].points,type:'cuboid',outside:false}]}]});
 job.annotations.get=async()=>h.state.annotation.annotations.states;
 job.frames={get:async()=>({deleted:false,data:async()=>({imageData:new Blob([new Float32Array([0,0,0]).buffer])})})};
 h.notify();assert.equal(h.adapter.getSnapshot().capabilities.batch,true);
 const opened=await h.adapter.command('BATCH_OPEN',{ref:h.ref(1)});
 assert.equal(opened.clientId,1);assert.equal(opened.serverId,99);
 const card=await h.adapter.command('BATCH_FRAME',{token:opened.token,frame:29});
 assert.equal(card.protected,true);
 await assert.rejects(h.adapter.command('BATCH_APPLY',{token:opened.token,frames:[29]}),/editable proposal/);
 assert.equal(h.history.length,0);h.adapter.dispose();
});

for(const command of ['SNAP_GROUND','MOVE_TO_MOUSE'])for(const height of [0,-.4,.4])test(`${command} origin fallback without cloud at ${height}`,async()=>{
    const h=topHarness();h.hover();h.state.annotation.annotations.states[0].points[2]=1.3;
    const result=await h.adapter.command(command,{ref:h.ref(1),originGroundFallback:true,fallbackGroundHeight:height});
    const after=h.adapter.getSnapshot().boxes[0].points;
    assert.ok(Math.abs(after[2]-after[8]/2-height)<1e-8);assert.equal(result.groundSource,'origin-fallback');assert.equal(h.history.length,1);h.adapter.dispose();
});
for(const command of ['SNAP_GROUND','MOVE_TO_MOUSE'])test(`${command} rejects invalid options and protects large height changes`,async()=>{
    const h=topHarness();h.hover();
    for(const options of [{fallbackGroundHeight:Infinity},{fallbackGroundHeight:'0'},{originGroundFallback:1},{moveLongitudinal:'left'},{moveLateral:'forward'}])await assert.rejects(h.adapter.command(command,{ref:h.ref(1),...options}),/Invalid/);
    assert.equal(h.history.length,0);
    if(command==='SNAP_GROUND')await assert.rejects(h.adapter.command(command,{ref:h.ref(1),originGroundFallback:true,fallbackGroundHeight:10}),/1.5m/);
    else {const r=await h.adapter.command(command,{ref:h.ref(1),originGroundFallback:true,fallbackGroundHeight:10});assert.equal(r.groundSource,null);assert.match(r.warning,/1.5m/);assert.equal(h.adapter.getSnapshot().boxes[0].points[2],1);}
    h.adapter.dispose();
});
test('Ground Snap fallback stays opt-in and does not replace measured ground',async()=>{
    const empty=topHarness();await assert.rejects(empty.adapter.command('SNAP_GROUND',{ref:empty.ref(1)}));assert.equal(empty.history.length,0);empty.adapter.dispose();
    const h=adjustmentHarness();const result=await h.adapter.command('SNAP_GROUND',{ref:h.ref(1),originGroundFallback:true,fallbackGroundHeight:.8});
    assert.equal(result.groundSource,'point-cloud');assert.ok(Math.abs(h.adapter.getSnapshot().boxes[0].points[2]-1)<1e-6);h.adapter.dispose();
});
test('mouse alignment and final ground resolve in one native save',async()=>{
    const h=topHarness(),scene=new THREE.Scene(),coords=[];
    h.state.annotation.annotations.states[1].points[0]=30;
    for(let x=-10;x<16;x+=.3)for(let y=-10;y<10;y+=.3)coords.push(x,y,.02*x);
    for(let i=0;i<=20;i++)for(let j=0;j<=10;j++)for(const z of [.8,1,1.2])coords.push(5.4+(i/20-.5)*2,2.7+(j/10-.5),z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));h.view.views.perspective={scene};h.hover();
    const result=await h.adapter.command('MOVE_TO_MOUSE',{ref:h.ref(1),moveLongitudinal:'forward',moveLateral:'right',originGroundFallback:true,fallbackGroundHeight:-.5});
    const after=h.adapter.getSnapshot().boxes[0].points;
    assert.equal(result.refined,true);assert.deepEqual(result.alignment,{longitudinal:'forward',lateral:'right'});assert.ok(Math.abs(after[0]-6.4)<.08);assert.ok(Math.abs(after[1]-2.2)<.08);
    assert.equal(result.groundSource,'point-cloud');assert.ok(Math.abs(after[2]-after[8]/2-.02*(after[0]+after[6]/2))<1e-5);assert.equal(h.history.length,1);h.adapter.dispose();
});

test('origin fallback handles an existing cloud with insufficient local ground evidence',async()=>{
    const h=adjustmentHarness({weakGround:true});
    const result=await h.adapter.command('SNAP_GROUND',{ref:h.ref(1),originGroundFallback:true,fallbackGroundHeight:-.2});
    assert.equal(result.groundSource,'origin-fallback');assert.ok(Math.abs(h.adapter.getSnapshot().boxes[0].points[2]-.8)<1e-8);assert.equal(h.history.length,1);h.adapter.dispose();
});
