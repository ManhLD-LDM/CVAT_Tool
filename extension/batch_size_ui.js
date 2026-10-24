(function(root){
'use strict';
function mount(env){
 const button=env.root.querySelector('#c3d-batch-size');let dialog=null,meta=null,plan=null,busy=false,disposed=false;
 function status(text){if(dialog)dialog.querySelector('[role=status]').textContent=text;}
 function stage(value){if(dialog)dialog.querySelectorAll('[data-step]').forEach(n=>n.classList.toggle('active',n.dataset.step===value));}
 function invalidate(){const hadPlan=!!plan;plan=null;if(dialog){dialog.querySelector('[data-apply]').disabled=true;stage('choose');if(hadPlan)status('Lựa chọn đã thay đổi. Xem trước lại trước khi áp dụng.');}}
 function setBusy(v){busy=v;if(!dialog)return;for(const el of dialog.querySelectorAll('button,input,select'))el.disabled=v;dialog.querySelector('[data-apply]').disabled=v||!plan||!plan.frames.length;}
 function close(){if(busy)return;dialog?.remove();dialog=null;meta=null;plan=null;env.request('BATCH_SIZE_CANCEL').catch(()=>{});}
 async function open(){
  if(dialog||busy||disposed)return;busy=true;
  try{
   const s=env.snapshot();meta=await env.request('BATCH_SIZE_OPEN',{ref:env.reference(s.activeBoxId)});
   if(disposed)return;
   dialog=document.createElement('dialog');dialog.className='c3d-size-dialog';dialog.setAttribute('aria-label','Batch Edit');
   dialog.innerHTML='<header><h2>Batch Edit</h2><button data-close>Đóng</button></header><p data-info></p>'+
    '<p>Chỉnh một track trên nhiều frame, giữ ID. Chọn chức năng rồi xem trước; không cần tải LiDAR.</p><label>Chức năng <select data-mode><option value="size">Kích thước box</option><option value="attributes">Thuộc tính theo class</option><option value="outside">Hiển thị / Outside</option><option value="property">Property: lock / occluded / hidden / keyframe / pinned</option></select></label><div data-attributes hidden></div>'+
    '<div class="c3d-size-fields"><label>Từ frame <input data-from type="number" step="1"></label><label>Đến frame <input data-to type="number" step="1"></label><button data-all>Toàn job</button></div>'+
    '<section data-property hidden><label>Property <select data-property-name><option value="occluded">Occluded · theo frame</option><option value="keyframe">Keyframe · theo frame</option><option value="lock">Lock · toàn track, editor</option><option value="hidden">Hidden · toàn track, editor</option><option value="pinned">Pinned · toàn track, editor</option></select></label> <label>Giá trị <select data-property-value><option value="true">true · Bật</option><option value="false">false · Tắt</option></select></label><p>Occluded là nhãn che khuất, không phải Outside. Gỡ keyframe sẽ thay đổi nội suy trong khoảng; giữ key đầu, key outside/chuyển trạng thái và key chứa attributes. Lock/Hidden/Pinned áp dụng toàn track trong phiên editor, không ghi vào JSON annotation server.</p><label><input data-confirm-global type="checkbox"> Tôi xác nhận property editor áp dụng TOÀN TRACK.</label></section>'+
    '<section data-outside hidden><label>Trạng thái <select data-outside-value><option value="true">Outside = true · Ẩn / không hiện diện</option><option value="false">Outside = false · Hiện / có mặt</option></select></label><p>Áp dụng cả frame đang outside. Giữ geometry sẵn có từng frame; không tự tracking hay tạo vị trí mới. Kiểm tra box sau khi bật hiện lại.</p></section>'+
    '<section data-size><div class="c3d-size-fields"><label>Dài L (m) <input data-l type="number" min="0.01" max="100" step="0.01"></label><label>Rộng W (m) <input data-w type="number" min="0.01" max="100" step="0.01"></label><label>Cao H (m) <input data-h type="number" min="0.01" max="100" step="0.01"></label></div>'+
    '<label>Mốc giữ cố định <select data-anchor><option value="bottom">Giữ cao độ đáy từng frame</option><option value="center">Giữ tâm XYZ từng frame</option></select></label></section>'+
    '<p>Kích thước: giữ đáy chỉ giữ cao độ hiện có, không tự snap xuống đường. Thuộc tính: trường theo frame chỉ sửa trong khoảng; trường cố định áp dụng toàn track và cần xác nhận. Ở chế độ Kích thước/Thuộc tính, frame outside được bỏ qua; chế độ Outside đọc và sửa cả các frame này. Track bị khóa / ground truth sẽ chặn thao tác. Tối đa 1000 frame/lần, tính cả hai đầu.</p>'+
    '<button data-preview>Xem trước</button><p role="status" aria-live="polite"></p>'+
    '<footer><button data-apply disabled>Xác nhận áp dụng</button><p>Native Undo cho từng lần ghi. Có thể thêm keyframe biên để giữ hình học ngoài khoảng. Các frame được sửa trở thành keyframe. Nhấn Save CVAT để lưu.</p></footer>';
   const steps=document.createElement('ol');steps.className='c3d-steps';steps.setAttribute('aria-label','Tiến trình Batch Edit');steps.innerHTML='<li data-step="choose" class="active">1 · Chọn thay đổi</li><li data-step="preview">2 · Xem trước</li><li data-step="applied">3 · Kết quả</li>';dialog.querySelector('header').after(steps);
   const guide=dialog.querySelector('[data-size]').nextElementSibling;if(guide?.tagName==='P'){const detail=document.createElement('details'),summary=document.createElement('summary');detail.className='c3d-edit-guide';summary.textContent='Phạm vi, giới hạn & cách lưu';detail.append(summary);guide.before(detail);detail.append(guide);}
   document.body.append(dialog);dialog.showModal();dialog.addEventListener('keydown',e=>e.stopPropagation());
   dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   dialog.querySelector('[data-info]').textContent='Job '+meta.jobId+' · Track #'+meta.clientId+' · '+(meta.label||'')+' · Frame hiện tại '+meta.frame;
   for(const name of ['from','to']){const input=dialog.querySelector('[data-'+name+']');input.min=meta.start;input.max=meta.stop;input.value=name==='from'?meta.start:Math.min(meta.stop,meta.start+999);}
   ['l','w','h'].forEach((n,i)=>dialog.querySelector('[data-'+n+']').value=Number(meta.dimensions[i].toFixed(6)));
   const attrRoot=dialog.querySelector('[data-attributes]');
   for(const a of meta.attributes||[]){
    const row=document.createElement('div'),label=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.dataset.attrEnable=a.id;enabled.setAttribute('aria-label','Sửa '+a.name);
    label.append(enabled,document.createTextNode(' '+a.name+' · '+(a.mutable?'theo khoảng frame':'TOÀN TRACK')));row.append(label);
    let input;if(['select','radio'].includes(a.inputType)){input=document.createElement('select');for(const value of a.values){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}}
    else{input=document.createElement('input');input.type=a.inputType==='checkbox'?'checkbox':a.inputType==='number'?'number':'text';if(a.inputType==='number'){[input.min,input.max,input.step]=a.values;}}
    input.dataset.attrValue=a.id;input.setAttribute('aria-label','Giá trị '+a.name);if(input.type==='checkbox')input.checked=String(a.value)==='true';else input.value=a.value;row.append(input);attrRoot.append(row);
   }
   if(!meta.attributes?.length){const note=document.createElement('p');note.textContent='Class này không có thuộc tính.';attrRoot.append(note);}
   const globalLabel=document.createElement('label'),globalConfirm=document.createElement('input');globalConfirm.type='checkbox';globalConfirm.dataset.confirmTrack='';globalConfirm.setAttribute('aria-label','Xác nhận thuộc tính toàn track');globalLabel.append(globalConfirm,document.createTextNode(' Tôi đồng ý thuộc tính cố định (ví dụ age) thay đổi trên TOÀN TRACK, kể cả ngoài khoảng frame.'));attrRoot.append(globalLabel);
   dialog.querySelector('[data-mode]').onchange=()=>{const attributes=dialog.querySelector('[data-mode]').value==='attributes';const outside=dialog.querySelector('[data-mode]').value==='outside',property=dialog.querySelector('[data-mode]').value==='property';dialog.querySelector('[data-property]').hidden=!property;dialog.querySelector('[data-size]').hidden=attributes||outside||property;dialog.querySelector('[data-outside]').hidden=!outside;attrRoot.hidden=!attributes;invalidate();};
   const updateScope=()=>{const property=dialog.querySelector('[data-mode]').value==='property',global=property&&['lock','hidden','pinned'].includes(dialog.querySelector('[data-property-name]').value);dialog.querySelector('.c3d-size-fields').hidden=global;dialog.querySelector('[data-confirm-global]').closest('label').hidden=!global;};
   dialog.querySelector('[data-mode]').addEventListener('change',updateScope);dialog.querySelector('[data-property-name]').addEventListener('change',updateScope);updateScope();
   dialog.querySelector('[data-close]').onclick=close;
   dialog.querySelector('[data-all]').onclick=()=>{dialog.querySelector('[data-from]').value=meta.start;dialog.querySelector('[data-to]').value=meta.stop;invalidate();status('Đã chọn toàn job. Xem trước để kiểm tra phạm vi.');};
   for(const el of dialog.querySelectorAll('input,select'))el.addEventListener('input',invalidate);
   dialog.querySelector('[data-preview]').onclick=preview;
   dialog.querySelector('[data-apply]').onclick=apply;status('Kích thước khởi đầu lấy từ box đang chọn. Nhập kích thước và xem trước.');
  }catch(e){env.toast(e.message,true);}finally{setBusy(false);}
 }
 async function preview(){
  invalidate();setBusy(true);status('Đang đọc annotation…');
  try{
   plan=await env.request('BATCH_SIZE_PREVIEW',{token:meta.token,from:dialog.querySelector('[data-from]').valueAsNumber,to:dialog.querySelector('[data-to]').valueAsNumber,
    mode:dialog.querySelector('[data-mode]').value,property:dialog.querySelector('[data-property-name]').value,value:dialog.querySelector('[data-property-value]').value==='true',confirmGlobal:dialog.querySelector('[data-confirm-global]').checked,outside:dialog.querySelector('[data-outside-value]').value==='true',attributes:Object.fromEntries((meta.attributes||[]).filter(a=>dialog.querySelector('[data-attr-enable="'+a.id+'"]').checked).map(a=>{const input=dialog.querySelector('[data-attr-value="'+a.id+'"]');return [a.id,input.type==='checkbox'?String(input.checked):input.value];})),confirmTrackAttributes:dialog.querySelector('[data-confirm-track]').checked,dimensions:['l','w','h'].map(n=>dialog.querySelector('[data-'+n+']').valueAsNumber),anchor:dialog.querySelector('[data-anchor]').value});
   status(plan.mode==='property'?'Track #'+plan.clientId+' · '+plan.property+' = '+plan.value+' · '+(plan.global?'TOÀN TRACK / chỉ phiên editor':'Frame '+plan.from+'–'+plan.to)+'\nSẽ sửa '+plan.frames.length+' frame; giữ key được bảo vệ: '+plan.skipped.join(', ')+'. Frame biên: '+(plan.boundaryFrames.join(', ')||'không cần')+'.':plan.mode==='outside'?'Track #'+plan.clientId+' · Frame '+plan.from+'–'+plan.to+' · Outside = '+plan.outside+' ('+(plan.outside?'Ẩn':'Hiện')+')\nĐổi trạng thái '+plan.changedCount+' frame; ghi '+plan.frames.length+' frame để giữ geometry. Frame biên giữ trạng thái: '+(plan.boundaryFrames.join(', ')||'không cần')+'. Geometry hiện lại lấy từ track sẵn có; cần kiểm tra lại.':plan.mode==='attributes'?'Track #'+plan.clientId+' · Frame '+plan.from+'–'+plan.to+' · '+plan.attributes.map(a=>a.name+' = '+a.value+' ('+(a.mutable?'theo frame':'TOÀN TRACK')+')').join('; ')+'\nSẽ sửa '+plan.frames.length+' frame; bỏ qua outside: '+plan.skipped.length+'; không đổi: '+plan.unchanged.length+'. Frame biên phục hồi thuộc tính: '+(plan.boundaryFrames.join(', ')||'không cần')+'.': 'Track #'+plan.clientId+' · Frame '+plan.from+'–'+plan.to+' · '+plan.dimensions.join(' × ')+' m · '+(plan.anchor==='bottom'?'Giữ đáy':'Giữ tâm')+'\nSẽ sửa '+plan.frames.length+' frame (gồm '+plan.keyframes+' keyframe hiện có). Bỏ qua outside: '+plan.skipped.length+'; đã đúng kích thước: '+plan.unchanged.length+'.\nKeyframe biên giữ nguyên hình học: '+(plan.boundaryFrames.join(', ')||'không cần')+'. Chỉ nhấn xác nhận nếu đúng track và phạm vi.');
   stage('preview');
  }catch(e){plan=null;status(e.message);}finally{setBusy(false);}
 }
 async function apply(){
  if(!plan||busy)return;setBusy(true);status('Đang áp dụng qua native CVAT…');
  try{
   const result=await env.request('BATCH_SIZE_APPLY',{token:meta.token,planId:plan.planId});
   stage('applied');status('Đã sửa '+result.appliedFrames.length+' frame; xử lý '+result.boundaryFrames.length+' frame biên.'+(result.error?'\nDừng: '+result.error:'')+'\n'+(result.editorOnly?'Trạng thái chỉ áp dụng trong phiên editor; không lưu trong annotation server.':result.saveRequired?'Nhấn Save CVAT để lưu. Native Undo có thể hoàn tác từng lần ghi.':'Không có thay đổi được xác nhận.')+'\nĐóng và mở lại Batch Edit để thực hiện lượt mới.');
   plan=null;dialog.querySelector('[data-preview]').hidden=true;
  }catch(e){plan=null;status(e.message+' · Kiểm tra CVAT trước khi thử lại.');}finally{setBusy(false);}
 }
 button?.addEventListener('click',open);
 return {dispose(){disposed=true;button?.removeEventListener('click',open);dialog?.remove();dialog=null;if(!busy)env.request('BATCH_SIZE_CANCEL').catch(()=>{});}};
}
root.__C3D_BATCH_SIZE_UI={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
