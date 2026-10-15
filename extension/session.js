'use strict';
const el=id=>document.getElementById(id),tabId=Number(new URL(location.href).searchParams.get('tab'));
let context=null,working=false,generation=0,importComplete=false;
const status=(text,error=false)=>{el('status').textContent=text;el('status').classList.toggle('error',error);};
async function runtime(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'Extension unavailable');return r.result;}
async function refresh(){
 const c=await runtime({type:'C3D_CONTEXT',tabId});
 if(context&&(c.origin!==context.origin||c.jobId!==context.jobId))throw new Error('Tab đã đổi server/job. Mở lại chức năng từ job đích.');
 context=c;el('context').textContent=c.origin+' · Job '+c.jobId;
 return c;
}
async function api(operation,payload={}){
 await refresh();
 const r=await chrome.tabs.sendMessage(tabId,{type:'C3D_SESSION_API',...context,operation,...payload});
 if(!r?.ok)throw new Error(r?.error||'Reload extension và tab CVAT rồi thử lại');
 return r.result;
}
function clear(){
 generation++;for(const id of ['session','csrf']){el(id).value='';el(id).type='password';}
 el('expiry').textContent='';
}
async function run(fn){
 if(working)return;working=true;
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await fn();}catch(e){status(e.message,true);}
 finally{working=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function save(bytes,name){
 const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)]));
 try{
  const id=await chrome.downloads.download({url,filename:name,saveAs:true});
  for(let i=0;i<600;i++){
   const [download]=await chrome.downloads.search({id});
   if(download?.state==='complete')return;
   if(!download||download.state==='interrupted')throw new Error('Download bị hủy hoặc thất bại; chưa import.');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Chưa xác nhận tải dự phòng hoàn tất; chưa import.');
 }finally{URL.revokeObjectURL(url);}
}
async function poll(id){
 if(typeof id!=='string'||!id)throw new Error('Server không trả rq_id; kiểm tra Requests của CVAT.');
 for(let i=0;i<600;i++){
  await new Promise(resolve=>setTimeout(resolve,2000));
  const r=await api('status',{requestId:id});
  status('CVAT: '+r.status+(r.progress!=null?' · '+Math.round(r.progress*100)+'%':''));
  if(r.status==='finished')return r;
  if(['failed','canceled','cancelled'].includes(r.status))throw new Error('CVAT request '+r.status+'; xem Requests để biết chi tiết.');
 }
 throw new Error('Chờ quá 20 phút. Kiểm tra Requests trước khi thử lại; tác vụ server có thể vẫn chạy.');
}
async function exportFile(backup=false){
 const format=el('export-format').value;if(!format)throw new Error('Đọc và chọn định dạng export trước');
 status(backup?'Đang tạo bản dự phòng…':'Đang export…');
 const started=await api('export',{format});
 const ready=await poll(started.rq_id);
 if(!ready.result_url)throw new Error('Server không trả file download; chưa import.');
 const file=await api('download',{url:ready.result_url});
 await save(file.bytes,'cvat-job'+context.jobId+(backup?'-backup-':'-')+Date.now()+'.zip');
 status('Đã tải file. Kiểm tra thư mục Downloads.');
}
el('read').onclick=()=>run(async()=>{
 const current=++generation;await refresh();
 const user=await api('user');
 const data=await runtime({type:'C3D_COOKIES',...context});
 if(generation!==current)return;
 el('session').value=data.session?.value||'';el('csrf').value=data.csrf||'';
 el('expiry').textContent=data.session?(data.session.expires?'Hết hạn: '+new Date(data.session.expires*1000).toLocaleString():'Cookie phiên, không có thời hạn cố định'):'Không có cookie sessionid; hệ thống có thể dùng cơ chế xác thực khác.';
 status('Người dùng: '+(user.username||user.id)+'. Phiên sẽ được xóa khỏi màn hình khi rời tab.');
});
el('clear').onclick=clear;
el('reveal').onclick=()=>{for(const id of ['session','csrf'])el(id).type=el(id).type==='password'?'text':'password';};
for(const [button,input] of [['copy-session','session'],['copy-csrf','csrf']])el(button).onclick=()=>run(async()=>{
 if(!el(input).value)throw new Error('Chưa đọc được giá trị này');
 await navigator.clipboard.writeText(el(input).value);status('Đã copy. Clipboard chứa thông tin xác thực.');
});
el('formats').onclick=()=>run(async()=>{
 const f=await api('formats');
 for(const [id,items] of [['export-format',f.exporters],['import-format',f.importers]]){
  el(id).replaceChildren();
  for(const item of items||[])if(item.enabled!==false){const o=document.createElement('option');o.value=item.name;o.textContent=item.name;el(id).append(o);}
 }
 status('Đã đọc định dạng từ server.');
});
el('export').onclick=()=>run(()=>exportFile());
el('import').onclick=()=>run(async()=>{
 await refresh();
 if(importComplete)throw new Error('Nạp lại tab CVAT trước khi tiếp tục.');
 const file=el('file').files[0],format=el('import-format').value;
 if(!file||file.size===0||file.size>8*1024*1024)throw new Error('Chọn file không rỗng, tối đa 8 MiB');
 if(!format||!el('ack').checked||el('confirm').value.trim()!==String(context.jobId))throw new Error('Chọn định dạng, xác nhận tác động và nhập đúng job ID.');
 if(!window.confirm(['IMPORT '+file.name,context.origin,'Job '+context.jobId,'Có thể thay thế annotation đã lưu. Tiếp tục sau khi tạo dự phòng?'].join(String.fromCharCode(10))))return;
 await exportFile(true);
 status('Đang upload '+file.name+'…');
 const bytes=Array.from(new Uint8Array(await file.arrayBuffer()));
 const started=await api('import',{format,confirmJob:context.jobId,file:{name:file.name,bytes}});
 await poll(started.rq_id);importComplete=true;el('reload').hidden=false;
 el('ack').checked=false;el('confirm').value='';
 status('Import hoàn tất trên server. Nạp lại tab CVAT trước khi chỉnh sửa tiếp; không Save dữ liệu editor cũ.');
});
el('reload').onclick=()=>run(async()=>{await refresh();await chrome.tabs.reload(tabId);status('Đã nạp lại tab CVAT.');});
el('script').onclick=()=>run(async()=>{
 await refresh();
 const script=[
 'import os, requests',
 'base = '+JSON.stringify(context.origin),
 'job_id = '+context.jobId,
 's = requests.Session()',
 's.cookies.set("sessionid", os.environ["CVAT_SESSIONID"], domain=base.split("://", 1)[1].split(":")[0])',
 'csrf = os.environ.get("CVAT_CSRFTOKEN")',
 'if csrf:',
 '    s.cookies.set("csrftoken", csrf)',
 '    s.headers["X-CSRFToken"] = csrf',
 's.headers["Referer"] = base + "/"',
 'r = s.get(base + "/api/users/self", timeout=30)',
 'r.raise_for_status()',
 'print(r.json().get("username"))',
 '# Export: POST /api/jobs/{job_id}/dataset/export?format=...&save_images=false',
 '# Import: POST /api/jobs/{job_id}/annotations/?format=... (multipart annotation_file)',
 '# Both return rq_id; poll GET /api/requests/{rq_id}. Back up before import.'
 ].join(String.fromCharCode(10));
 await navigator.clipboard.writeText(script);status('Đã copy mẫu Python, không chứa cookie thật.');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
window.addEventListener('pagehide',clear);
refresh().then(()=>status('Sẵn sàng. Chưa đọc cookie.')).catch(e=>status(e.message,true));
