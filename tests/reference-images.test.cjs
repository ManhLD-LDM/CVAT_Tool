const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../extension/reference_images.js');
test('default image order and compass bearing match all eight requested POVs',()=>{
 const cfg=m.defaults();assert.deepEqual(cfg.slots.map(s=>s.name),['Back','Front','Front-left','Left','Back-left','Front-right','Right','Back-right']);
 for(const slot of cfg.slots){const r=slot.angle*Math.PI/180,bearing=m.bearing([10,20,0],[10+Math.cos(r)*10,20-Math.sin(r)*10,5]);assert.equal(m.select(cfg,bearing).id,slot.id);}
 assert.equal(m.bearing([0,0,0],[0,0,100]),null);
});
test('heading calibration, edited boundaries, hysteresis and empty slots',()=>{
 const cfg=m.defaults();cfg.heading=90;assert.equal(m.select(cfg,90).name,'Front');cfg.heading=0;
 const front=m.select(cfg,0),right=m.select(cfg,45);assert.equal(m.select(cfg,23,front.id).id,front.id);assert.equal(m.select(cfg,27,front.id).id,right.id);
 cfg.slots.find(s=>s.name==='Front-right').start=30;assert.equal(m.select(cfg,27).name,'Front');assert.equal(m.select(cfg,35).name,'Front-right');
 cfg.slots=[];assert.equal(m.select(cfg,0),null);assert.equal(m.select(m.defaults(),null),null);
});
test('configuration rejects duplicate centers and handles one direction',()=>{
 const cfg=m.defaults();cfg.slots=[{id:'single',name:'Any',angle:17,image:0,start:null}];const normalized=m.normalize(cfg);for(const angle of [0,90,180,359])assert.equal(m.select(normalized,angle).id,'single');
 cfg.slots.push({...cfg.slots[0],id:'other'});assert.equal(m.normalize(cfg).slots.length,1);assert.deepEqual(m.normalize(m.defaults()),m.defaults());
});
