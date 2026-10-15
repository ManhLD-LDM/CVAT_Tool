const {test}=require('node:test');
const assert=require('node:assert/strict');
const s=require('../extension/shortcut_settings.js');
test('shortcut settings preserve valid choices and clear assignments across serialization',()=>{
    const settings=s.defaults();settings.keepDirection=true;settings.adjustMoveDirection=true;
    s.assign(settings,'SNAP_GROUND',s.fromEvent({code:'KeyZ'}));
    s.assign(settings,'AUTO_FIT',null);
    assert.deepEqual(s.normalize(JSON.parse(JSON.stringify(settings))),settings);
    assert.equal(s.format(settings.bindings.SNAP_GROUND),'Z');
    assert.equal(s.format(settings.bindings.MOVE_TO_MOUSE),'Alt+Shift+M');
});
test('shortcuts reject duplicate bindings, modifiers alone, and invalid saved values',()=>{
    const settings=s.defaults();
    assert.throws(()=>s.assign(settings,'AUTO_FIT',settings.bindings.SNAP_GROUND),/Already assigned/);
    assert.throws(()=>s.assign(settings,'AUTO_FIT',{code:'ShiftLeft'}),/supported key/);
    assert.equal(s.fromEvent({code:'ShiftLeft'}),null);
    const restored=s.normalize({version:1,keepDirection:'yes',bindings:{AUTO_FIT:{code:'KeyZ',alt:'yes'}}});
    assert.deepEqual(restored,s.defaults());
    assert.equal(s.normalize({version:1,adjustMoveDirection:'yes'}).adjustMoveDirection,false);
    const older=s.defaults();delete older.adjustMoveDirection;
    assert.equal(s.normalize(older).adjustMoveDirection,false);
    // A custom key that is another action's default must survive loading.
    s.assign(settings,'SNAP_GROUND',null);s.assign(settings,'AUTO_FIT',s.defaults().bindings.SNAP_GROUND);
    assert.deepEqual(s.normalize(settings),settings);
});

test('new Auto Adjust shortcut preserves existing user assignments during settings upgrade',()=>{
    const older=s.defaults();delete older.bindings.AUTO_ADJUST;
    older.bindings.SNAP_GROUND={code:'KeyB',alt:true,shift:true,ctrl:false,meta:false};
    const restored=s.normalize(older);
    assert.deepEqual(restored.bindings.SNAP_GROUND,older.bindings.SNAP_GROUND);assert.equal(restored.bindings.AUTO_ADJUST,null);
    delete older.bindings.SNAP_GROUND;
    assert.equal(s.format(s.normalize(older).bindings.AUTO_ADJUST),'Alt+Shift+B');
});
