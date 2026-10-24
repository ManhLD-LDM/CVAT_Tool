const {test}=require('node:test'),assert=require('node:assert/strict'),s=require('../extension/shortcut_settings.js');
test('v1 migration preserves custom and cleared keyboard bindings and removes shrink settings',()=>{
 const raw={version:1,keepDirection:true,maxShrinkDistance:.4,maxShrinkPercent:20,bindings:{MOVE_TO_MOUSE:{code:'KeyZ',alt:true,shift:false,ctrl:false,meta:false},AUTO_FIT:null}},value=s.normalize(raw);
 assert.equal(value.version,2);assert.equal(value.keepDirection,true);assert.deepEqual(value.bindings.MOVE_TO_MOUSE,raw.bindings.MOVE_TO_MOUSE);assert.equal(value.bindings.AUTO_FIT,null);assert.equal('maxShrinkDistance'in value,false);assert.equal('maxShrinkPercent'in value,false);assert.equal('adjustMoveDirection'in value,false);
 assert.equal(s.format(s.defaults().bindings.MOVE_TO_MOUSE),'M');assert.equal(s.format(value.bindings.CORNER_TO_MOUSE),'E');assert.equal(s.format(value.bindings.ROTATE_DRAG),'R+Left mouse');
});
test('keyboard, mouse buttons, wheel and held-key combinations round-trip',()=>{
 for(const event of [{code:'KeyZ'},...[0,1,2,3,4].map(button=>({type:'pointerdown',button})),{type:'wheel',deltaY:-1},{type:'wheel',deltaY:1}])for(const hold of [undefined,...(event.type?['KeyR']:[])]){
  const settings=s.defaults(),value=s.fromEvent({...event,ctrlKey:true},hold);s.assign(settings,'SNAP_GROUND',value);assert.deepEqual(s.normalize(JSON.parse(JSON.stringify(settings))),settings);assert.ok(s.format(value).startsWith('Ctrl+'));
 }
 assert.equal(s.fromEvent({type:'wheel',deltaY:0}),null);assert.equal(s.fromEvent({code:'ShiftLeft'}),null);
});
test('drag bindings require a mouse button and conflicts are rejected',()=>{
 const settings=s.defaults();assert.throws(()=>s.assign(settings,'ROTATE_DRAG',s.fromEvent({code:'KeyX'})),/mouse button/);assert.throws(()=>s.assign(settings,'ROTATE_DRAG',s.fromEvent({type:'wheel',deltaY:1})),/mouse button/);
 s.assign(settings,'ROTATE_DRAG',s.fromEvent({type:'pointerdown',button:2}));assert.equal(s.format(settings.bindings.ROTATE_DRAG),'Right mouse');assert.throws(()=>s.assign(settings,'SNAP_GROUND',settings.bindings.ROTATE_DRAG),/Already assigned/);
});
test('duplicate migration preserves custom assignments before new defaults',()=>{
 const raw={version:1,bindings:{SNAP_GROUND:s.defaults().bindings.CORNER_TO_MOUSE}},restored=s.normalize(raw);assert.deepEqual(restored.bindings.SNAP_GROUND,raw.bindings.SNAP_GROUND);assert.equal(restored.bindings.CORNER_TO_MOUSE,null);
});
test('appearance, auto toggles, signed ground height and direction options persist and validate',()=>{
 const settings={...s.defaults(),autoMove:false,autoGround:false,background:'#abcdef',projectionFollow:false,projectionSize:32,useOriginGround:true,fallbackGroundHeight:-.4,moveLongitudinal:'forward',moveLateral:'right'};assert.deepEqual(s.normalize(settings),settings);
 const invalid=s.normalize({...settings,projectionSize:100,background:'red',fallbackGroundHeight:Infinity,moveLongitudinal:'left'});assert.equal(invalid.projectionSize,2);assert.equal(invalid.background,null);assert.equal(invalid.fallbackGroundHeight,0);assert.equal(invalid.moveLongitudinal,'none');
});
