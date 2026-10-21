(function(root){
'use strict';
function mount(env){
 let dialog=null,working=false;
 async function open(){
  const preview=await env.request('PREVIEW_ANNOTATION_IMPORT',{jobId:env.jobId,sessionId:env.sessionId,payload:env.data,mode:'edit'});
  dialog=document.createElement('dialog');dialog.className='c3d-import-dialog';dialog.setAttribute('aria-label','Chọn ID import');
  const title=document.createElement('h2');title.textContent='Chỉnh ID đã chọn theo file';dialog.append(title);
  if(preview.source){const source=document.createElement('p');source.textContent='Nguồn: '+(preview.source.toolVersion?'tool v'+preview.source.toolVersion:'không có phiên bản tool')+' · '+(preview.source.jobId!=null?'Job '+preview.source.jobId:'không có metadata job')+' · '+(preview.source.hasDisplayIds?'có ID hiển thị':'thiếu ID hiển thị')+'. Đích hiện tại: Job '+env.jobId+'.';dialog.append(source);}
  const note=document.createElement('p');note.textContent='File là mẫu cho toàn bộ frame của mỗi #clientID đã chọn: vị trí, kích thước, góc xoay, thuộc tính và xuất hiện/biến mất. Keyframe được chép đầy đủ; frame ở giữa dùng nội suy CVAT. Giữ đối tượng và ID hiện tại, không tạo hoặc xóa box. ID ngoài lựa chọn được giữ nguyên.';dialog.append(note);
  if(preview.frameRange){const range=document.createElement('p');range.textContent='Toàn bộ job: frame '+preview.frameRange.start+'–'+preview.frameRange.stop+' (bao gồm hai đầu). Khác frame bắt đầu vẫn chỉnh được.';dialog.append(range);}
  const filter=document.createElement('input');filter.type='search';filter.placeholder='Tìm số ID hoặc class';filter.setAttribute('aria-label','Tìm ID import');dialog.append(filter);
  const all=document.createElement('button');all.textContent='Chọn tất cả';const none=document.createElement('button');none.textContent='Bỏ chọn';dialog.append(all,none);
  const summary=document.createElement('p');summary.setAttribute('role','status');dialog.append(summary);
  const table=document.createElement('div');table.className='c3d-import-rows';dialog.append(table);
  const selections=new Map();
  const targets=preview.targets||preview.rows.filter(r=>r.matched).map(r=>({kind:r.kind,clientID:r.targetClientId,label:r.label}));
  const mappingNote=document.createElement('p');
   mappingNote.textContent='Chỉnh khớp theo #clientID hiển thị, không theo DB ID. Ví dụ nguồn #38 sẽ sửa trực tiếp CVAT #38, giữ ID của box đang có. File thiếu clientID phải chọn #ID đích thủ công. ClientID có thể đổi khi nạp lại editor: kiểm tra đúng box trong preview. Không đoán từ thứ tự file.';
   table.before(mappingNote);
  const update=()=>{
   const chosen=[...selections.values()].filter(x=>x.check.checked),missing=chosen.filter(x=>!x.target.value).length;
   const ids=chosen.filter(x=>x.target.value).map(x=>(x.row.kind||'')+':'+x.target.value),duplicates=new Set(ids).size!==ids.length;
   summary.textContent=chosen.length+' / '+preview.rows.length+' ID được chọn · Job '+env.jobId+(missing?' · '+missing+' ID chưa có đích — chọn CVAT #ID ở từng dòng; không tạo ID mới.':'')+(duplicates?' · Trùng ID đích — mỗi nguồn phải có đích riêng.':'');
   apply.disabled=!chosen.length||!!missing||duplicates;
  };
  for(const row of preview.rows){
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!!row.matched;check.dataset.importKey=row.key;
   const source=row.sourceClientId==null?'không có số hiển thị':'#'+row.sourceClientId;
   const text='Nguồn '+source+' · DB '+(row.sourceServerId??'chưa lưu')+' → '+(row.matched?'CVAT #'+row.targetClientId:'không tìm thấy ID đích')+(row.dbDiffers?' · DB khác; vẫn sửa theo #clientID, giữ DB đích '+(row.targetServerId??'chưa lưu'):'')+' · '+row.label+' · '+row.frames+' keyframe';
   const description=document.createElement('span');description.textContent=text;
   label.append(check,description);label.dataset.search=text.toLowerCase();table.append(label);
   const target=document.createElement('select');target.setAttribute('aria-label','CVAT ID đích '+row.key);target.dataset.targetKey=row.key;
    const empty=document.createElement('option');empty.value='';empty.textContent='Chọn CVAT #ID đích…';target.append(empty);
    for(const item of targets.filter(t=>!row.kind||t.kind===row.kind)){
     const option=document.createElement('option');option.value=String(item.clientID);option.textContent='CVAT #'+item.clientID+' · '+item.label+' · DB '+(item.serverID??'chưa lưu');
     target.append(option);
    }
    target.value=row.matched?String(row.targetClientId):'';label.append(document.createElement('br'),target);
    target.onchange=()=>{check.checked=!!target.value;confirm.checked=false;
     description.textContent='Nguồn '+source+' · DB '+(row.sourceServerId??'chưa lưu')+' → '+(target.value?'CVAT #'+target.value+' (đích đã chọn)':'chưa chọn #ID đích')+' · '+row.label+' · '+row.frames+' keyframe';
     label.dataset.search=description.textContent.toLowerCase();update();};
   selections.set(row.key,{check,label,row,target});check.onchange=()=>{confirm.checked=false;update();};
  }
  filter.oninput=()=>{for(const {label} of selections.values())label.hidden=!label.dataset.search.includes(filter.value.toLowerCase());};
  all.onclick=()=>{for(const {check} of selections.values())check.checked=true;confirm.checked=false;update();};none.onclick=()=>{for(const {check} of selections.values())check.checked=false;confirm.checked=false;update();};
  const warning=document.createElement('label'),confirm=document.createElement('input');confirm.type='checkbox';confirm.setAttribute('aria-label','Xác nhận thay đổi annotation');warning.append(confirm,document.createTextNode(' Tôi đã kiểm tra ID/phạm vi ở trên. Áp dụng vào editor; Save CVAT để lưu server.'));dialog.append(warning);
  const apply=document.createElement('button');apply.textContent='Áp dụng chỉnh sửa';dialog.append(apply);
  const close=document.createElement('button');close.textContent='Đóng';dialog.append(close);
  close.onclick=()=>{if(!working){dialog.remove();dialog=null;}};
  dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());
  apply.onclick=async()=>{
   if(working)return;if(!confirm.checked){summary.textContent='Đánh dấu xác nhận sau khi kiểm tra ID/phạm vi.';return;}
   const keys=[...selections].filter(([,x])=>x.check.checked).map(([key])=>key);
   if(!keys.length){summary.textContent='Chọn ít nhất một ID.';return;}
   working=true;dialog.querySelectorAll('input,button,select').forEach(n=>n.disabled=true);summary.textContent='Đang cập nhật native editor…';
   try{
    const mapping={};for(const key of keys){const x=selections.get(key);if(x.target?.value&&(!x.row.matched||Number(x.target.value)!==x.row.targetClientId))mapping[key]=Number(x.target.value);}
    const result=await env.request('IMPORT_ALL_ANNOTATIONS',{jobId:env.jobId,sessionId:env.sessionId,token:preview.token,keys,...(Object.keys(mapping).length?{mapping}:{})});
    summary.textContent=(result.error?'Dừng: '+result.error+' · ':'')+'Đã sửa #'+result.changed.join(', #')+'. '+result.message;
    env.toast(result.error||'Editor đã cập nhật. Save CVAT để lưu; không cần reload.',!!result.error);apply.hidden=true;
   }catch(error){summary.textContent=error.message;env.toast(error.message,true);apply.hidden=true;}
   finally{working=false;close.disabled=false;}
  };
  document.body.append(dialog);dialog.showModal();update();
 }
 return {open,dispose(){if(!working){dialog?.remove();dialog=null;}}};
}
root.__C3D_ANNOTATION_IO_UI={mount};
})(typeof window!=='undefined'?window:globalThis);
