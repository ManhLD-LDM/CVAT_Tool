const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../extension/geometry_math.js');
const plane=m.makePlane(0,0,0,{accepted:true,confidence:.99});
const box=(l=2,w=1,h=1.5,yaw=0)=>({points:[0,0,h/2,0,0,yaw,l,w,h,0,0,0,0,0,0,0]});
function cloud({xmin=-1,xmax=1,ymin=-.5,ymax=.5,top=1.5,yaw=0,ground=plane,roofOnly=false}={}){
    const out=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0;i<=30;i++)for(let j=0;j<=16;j++){
        const x=xmin+(xmax-xmin)*i/30,y=ymin+(ymax-ymin)*j/16,wx=c*x-s*y,wy=s*x+c*y;
        out.push([wx,wy,top]);
        if(!roofOnly&&(i===0||i===30||j===0||j===16))for(let z=ground.getTargetZ(wx,wy)+.15;z<top;z+=.15)out.push([wx,wy,z]);
    }
    return out;
}
function bounds(points){const p=points,c=Math.cos(p[5]),s=Math.sin(p[5]),x=c*p[0]+s*p[1],y=-s*p[0]+c*p[1];return [x-p[6]/2,x+p[6]/2,y-p[7]/2,y+p[7]/2,p[2]+p[8]/2];}
const close=(a,b,t=.012)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

test('Auto Adjust expands missed points and shrinks empty faces independently while keeping direction and ground',()=>{
    const original=box(2,1,1.5,.37),source=cloud({xmin:-.92,xmax:1.2,ymin:-.455,ymax:.65,top:1.44,yaw:.37});
    const r=m.autoAdjustBox(source,original,plane),b=bounds(r.points);
    assert.equal(r.changed,true);[-.95,1.23,-.485,.68,1.47].forEach((v,i)=>close(b[i],v));
    assert.deepEqual(r.points.slice(3,6),original.points.slice(3,6));close(r.points[2]-r.points[8]/2,0,1e-8);
    assert.equal(m.extractBoxROI(source,{points:r.points},0).length,source.length);
    assert.deepEqual(original.points,box(2,1,1.5,.37).points);
});
test('Auto Adjust keeps the bottom on a sloped ground footprint',()=>{
    const ground=m.makePlane(.04,-.03,.2,{accepted:true,confidence:.99}),original=box(2,1,1.6,.4);
    original.points=m.snapGroundPoints(original.points,ground).newPoints;
    const oldTop=original.points[2]+original.points[8]/2;
    const r=m.autoAdjustBox(cloud({xmin:-.95,xmax:1.1,ymin:-.47,ymax:.6,top:oldTop-.04,yaw:.4,ground}),original,ground);
    const residuals=m.cuboidVertices(r.points).map(([x,y,z])=>z-ground.getTargetZ(x,y));
    close(Math.min(...residuals),0,1e-8);assert.ok(residuals.every(v=>v>=-1e-8));close(r.points[2]+r.points[8]/2,oldTop-.01);
});
test('Auto Adjust preserves side faces with roof-only evidence, caps local corrections, and is idempotent',()=>{
    const original=box(),roof=m.autoAdjustBox(cloud({xmin:-.95,xmax:.95,ymin:-.46,ymax:.46,top:1.44,roofOnly:true}),original,plane);
    close(roof.points[6],2);close(roof.points[7],1);assert.equal(roof.retainedFaces.length,4);close(roof.points[2]+roof.points[8]/2,1.47);
    const large=box(3,1.6,1.8),r=m.autoAdjustBox(cloud({xmin:-.8,xmax:.8,ymin:-.4,ymax:.4,top:1.3}),large,plane);
    assert.deepEqual(r.points,large.points);assert.equal(r.retainedFaces.length,5);
    const source=cloud({xmin:-.94,xmax:1.15,ymin:-.46,ymax:.6,top:1.44}),first=m.autoAdjustBox(source,box(),plane);
    const second=m.autoAdjustBox(source,{points:first.points},plane);assert.equal(second.changed,false);
});
test('Auto Adjust rejects weak ground, empty evidence, tilted boxes, and points owned by another annotation',()=>{
    const original=box(),source=cloud();
    assert.throws(()=>m.autoAdjustBox(source,original,{...plane,confidence:.4}),/Reliable ground/);
    assert.throws(()=>m.autoAdjustBox([],original,plane),/Insufficient object points/);
    const tilted=box();tilted.points[3]=.1;assert.throws(()=>m.autoAdjustBox(source,tilted,plane),/upright/);
    assert.throws(()=>m.autoAdjustBox(source,original,plane,[box(3,2,2)]),/Insufficient object points/);
});
test('Auto Adjust ignores disconnected noise and ground without clamping to class minimum dimensions',()=>{
    const original=box(),source=cloud({xmin:-.8,xmax:.8,ymin:-.4,ymax:.4,top:1.3});
    source.push([1.35,1.35,1.6]);for(let x=-1.3;x<=1.3;x+=.15)for(let y=-.8;y<=.8;y+=.15)source.push([x,y,0]);
    const r=m.autoAdjustBox(source,original,plane);close(r.points[6],2);close(r.points[7],1);close(r.points[8],1.5);
    const connected=cloud();connected.push([1.25,0,1.2]);
    const clean=m.autoAdjustBox(connected,original,plane);close(bounds(clean.points)[1],1.03);
});

test('missing rear returns cannot shrink a car into its visible front, including repeated actions',()=>{
    let current=box(4,1.8,1.6,.25);
    const source=cloud({xmin:0,xmax:2,ymin:-.9,ymax:.9,top:1.6,yaw:.25});
    for(let i=0;i<8;i++){
        const result=m.autoAdjustBox(source,current,plane),b=bounds(result.points);
        close(b[0],-2,1e-8);assert.ok(result.points[6]>=4-1e-8);assert.ok(result.retainedFaces.includes('rear'));
        current={points:result.points};
    }
});

test('shrinking requires a nearby supported surface and preserves distant faces instead of taking capped steps',()=>{
    const original=box(4,2,1.8),source=cloud({xmin:-1.92,xmax:1.5,ymin:-.93,ymax:.7,top:1.5});
    const r=m.autoAdjustBox(source,original,plane),b=bounds(r.points);
    close(b[0],-1.95);close(b[1],2);close(b[2],-.96);close(b[3],1);close(b[4],1.8);
    assert.ok(r.retainedFaces.includes('front'));assert.ok(r.retainedFaces.includes('left'));assert.ok(r.retainedFaces.includes('top'));
    assert.ok(r.points[6]>=3.9);assert.ok(r.points[7]>=1.9);
});
