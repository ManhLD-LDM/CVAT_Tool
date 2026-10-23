(function(root){
'use strict';
function mount(env){
 const button=env.root.querySelector('#c3d-batch-size');let dialog=null,meta=null,plan=null,busy=false,disposed=false;
 function status(text){if(dialog)dialog.querySelector('[role=status]').textContent=text;}
 function invalidate(){plan=null;if(dialog)dialog.querySelector('[data-apply]').disabled=true;}
 function setBusy(v){busy=v;if(!dialog)return;for(const el of dialog.querySelectorAll('button,input,select'))el.disabled=v;dialog.querySelector('[data-apply]').disabled=v||!plan||!plan.frames.length;}
 function close(){if(busy)return;dialog?.remove();dialog=null;meta=null;plan=null;env.request('BATCH_SIZE_CANCEL').catch(()=>{});}
 async function open(){
  if(dialog||busy||disposed)return;busy=true;
  try{
   const s=env.snapshot();meta=await env.request('BATCH_SIZE_OPEN',{ref:env.reference(s.activeBoxId)});
   if(disposed)return;
   dialog=document.createElement('dialog');dialog.className='c3d-size-dialog';dialog.setAttribute('aria-label','Batch Edit');
   dialog.innerHTML='<header><h2>Batch Edit</h2><button data-close>Đóng</button></header><p data-info></p>'+
    '<p>Chỉnh một track trên nhiều frame, giữ ID. Chọn chức năng rồi xem trước; không cần tải LiDAR.</p><label>Chức năng <select data-mode><option value="size">Kích thước box</option><option value="attributes">Thuộc tính theo class</option></select></label><div data-attributes hidden></div>'+
    '<div class="c3d-size-fields"><label>Từ frame <input data-from type="number" step="1"></label><label>Đến frame <input data-to type="number" step="1"></label><button data-all>Toàn job</button></div>'+
    '<section data-size><div class="c3d-size-fields"><label>Dài L (m) <input data-l type="number" min="0.01" max="100" step="0.01"></label><label>Rộng W (m) <input data-w type="number" min="0.01" max="100" step="0.01"></label><label>Cao H (m) <input data-h type="number" min="0.01" max="100" step="0.01"></label></div>'+
    '<label>Mốc giữ cố định <select data-anchor><option value="bottom">Giữ cao độ đáy từng frame</option><option value="center">Giữ tâm XYZ từng frame</option></select></label></section>'+
    '<p>Kích thước: giữ đáy chỉ giữ cao độ hiện có, không tự snap xuống đường. Thuộc tính: trường theo frame chỉ sửa trong khoảng; trường cố định áp dụng toàn track và cần xác nhận. Frame outside được bỏ qua. Track bị khóa / ground truth sẽ chặn thao tác. Tối đa 1000 frame/lần, tính cả hai đầu.</p>'+
    '<button data-preview>Xem trước</button><p role="status" aria-live="polite"></p>'+
    '<footer><button data-apply disabled>Xác nhận áp dụng</button><p>Native Undo cho từng lần ghi. Có thể thêm keyframe biên để giữ hình học ngoài khoảng. Các frame được sửa trở thành keyframe. Nhấn Save CVAT để lưu.</p></footer>';
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
   dialog.querySelector('[data-mode]').onchange=()=>{const attributes=dialog.querySelector('[data-mode]').value==='attributes';dialog.querySelector('[data-size]').hidden=attributes;attrRoot.hidden=!attributes;invalidate();};
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
    mode:dialog.querySelector('[data-mode]').value,attributes:Object.fromEntries((meta.attributes||[]).filter(a=>dialog.querySelector('[data-attr-enable="'+a.id+'"]').checked).map(a=>{const input=dialog.querySelector('[data-attr-value="'+a.id+'"]');return [a.id,input.type==='checkbox'?String(input.checked):input.value];})),confirmTrackAttributes:dialog.querySelector('[data-confirm-track]').checked,dimensions:['l','w','h'].map(n=>dialog.querySelector('[data-'+n+']').valueAsNumber),anchor:dialog.querySelector('[data-anchor]').value});
   status(plan.mode==='attributes'?'Track #'+plan.clientId+' · Frame '+plan.from+'–'+plan.to+' · '+plan.attributes.map(a=>a.name+' = '+a.value+' ('+(a.mutable?'theo frame':'TOÀN TRACK')+')').join('; ')+'\nSẽ sửa '+plan.frames.length+' frame; bỏ qua outside: '+plan.skipped.length+'; không đổi: '+plan.unchanged.length+'. Frame biên phục hồi thuộc tính: '+(plan.boundaryFrames.join(', ')||'không cần')+'.': 'Track #'+plan.clientId+' · Frame '+plan.from+'–'+plan.to+' · '+plan.dimensions.join(' × ')+' m · '+(plan.anchor==='bottom'?'Giữ đáy':'Giữ tâm')+'\nSẽ sửa '+plan.frames.length+' frame (gồm '+plan.keyframes+' keyframe hiện có). Bỏ qua outside: '+plan.skipped.length+'; đã đúng kích thước: '+plan.unchanged.length+'.\nKeyframe biên giữ nguyên hình học: '+(plan.boundaryFrames.join(', ')||'không cần')+'. Chỉ nhấn xác nhận nếu đúng track và phạm vi.');
  }catch(e){plan=null;status(e.message);}finally{setBusy(false);}
 }
 async function apply(){
  if(!plan||busy)return;setBusy(true);status('Đang áp dụng qua native CVAT…');
  try{
   const result=await env.request('BATCH_SIZE_APPLY',{token:meta.token,planId:plan.planId});
   status('Đã sửa '+result.appliedFrames.length+' frame; xử lý '+result.boundaryFrames.length+' frame biên.'+(result.error?'\nDừng: '+result.error:'')+'\n'+(result.saveRequired?'Nhấn Save CVAT để lưu. Native Undo có thể hoàn tác từng lần ghi.':'Không có thay đổi được xác nhận.')+'\nĐóng và mở lại Batch Edit để thực hiện lượt mới.');
   plan=null;dialog.querySelector('[data-preview]').hidden=true;
  }catch(e){plan=null;status(e.message+' · Kiểm tra CVAT trước khi thử lại.');}finally{setBusy(false);}
 }
 button?.addEventListener('click',open);
 return {dispose(){disposed=true;button?.removeEventListener('click',open);dialog?.remove();dialog=null;if(!busy)env.request('BATCH_SIZE_CANCEL').catch(()=>{});}};
}
root.__C3D_BATCH_SIZE_UI={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
