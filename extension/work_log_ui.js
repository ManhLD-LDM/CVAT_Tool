(function(root){
'use strict';
function mount(env){
 const panel=env.panel,api=root.__C3D_WORK_LOG;
 const available=!!(globalThis.chrome?.runtime?.id&&chrome.runtime.sendMessage&&api);
 let state=null,date=api?.dayKey(Date.now())||'',disposed=false,activeId=null,baseline=null,scope='',timer=null,refreshTimer=null,scanQueue=Promise.resolve(),paused=0,seq=0,page=0,lastActivity=Date.now(),error='',refreshing=false,lastSaved=null,followToday=true;
 const epoch=globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
 const proposals=new Map(),batchTargets=new Map(),ignored=new Set();
 panel.innerHTML='<h3>Theo dõi công việc</h3><p class="c3d-task-note">Nhật ký cục bộ cho server hiện tại · KPI tự theo dõi, không phải kết quả QC.</p>'+
 '<div class="c3d-work-row"><label>Ngày<input data-work-date type="date"></label><button data-work-in>Vào ca</button><button data-work-out>Ra ca</button></div><p data-work-shift></p>'+
 '<section class="c3d-task-group"><h3>KPI của ngày</h3><div class="c3d-work-row" data-work-goal><label>Mục tiêu<input data-work-target type="number" min="0" max="1000000" step="1" value="0"></label><label>Đơn vị<select data-work-unit><option value="cuboids">Cuboid-frame có thay đổi</option><option value="objects">Object có thay đổi</option></select></label><button data-work-set>Lưu KPI</button></div><p data-work-progress></p><progress data-work-bar max="100" value="0" aria-label="Tiến độ KPI"></progress></section>'+
 '<div class="c3d-work-metrics"><div><strong data-work-cuboids>0</strong><span>Cuboid có thay đổi</span></div><div><strong data-work-objects>0</strong><span>Object có thay đổi</span></div><div><strong data-work-saved>0</strong><span>Cuboid CVAT báo đã lưu</span></div><div><strong data-work-time>0 phút</strong><span>Thời gian hoạt động ước tính</span></div></div>'+
 '<details class="c3d-task-details"><summary>Ca làm việc trong ngày</summary><ul data-work-shifts></ul></details><p data-work-decisions></p><p data-work-status role="status" aria-live="polite"></p>'+
 '<details class="c3d-task-details"><summary>Cách đếm & phạm vi ghi nhận</summary><p class="c3d-task-note">Chỉ ghi khi đang vào ca và tool đang theo dõi. Một server/job/object/frame chỉ tính một lần trong ngày dù chỉnh nhiều lần. Đếm mốc cuboid native được ghi, không nhân số frame nội suy. Chỉnh trong CVAT và qua tool đều được đọc từ annotation native; không cần tải LiDAR. Undo về trạng thái đầu đã quan sát sẽ giảm KPI có thay đổi; số đã tác động vẫn giữ để tham khảo. Xóa/outside không tăng KPI cuboid.</p><p class="c3d-task-note">Thuộc tính/class toàn track tính ở object, không nhân thành cuboid. Chọn box, camera, QC, lock/hidden/pinned và import qua tool không tăng KPI. Gợi ý nhận/bỏ qua chỉ tính đề xuất tự động trong Batch Review đã Apply thành công hoặc chủ động Protect; bỏ chọn/đóng cửa sổ không tính bỏ qua.</p><p class="c3d-task-note">Không ghi ngược lịch sử trước lúc vào ca. Mốc đầu mỗi lần mở/chuyển editor là baseline, không phải việc đã làm. Đây là dữ liệu cá nhân của profile trình duyệt, tách riêng từng server; không đồng bộ tài khoản hay thiết bị. Nhịp hoạt động chỉ tính khi trang có focus và có tương tác trong 5 phút gần đây; ca mở không tự cộng thời gian khi đóng trình duyệt. Đã lưu là trạng thái CVAT báo tại lần đọc, không phải nghiệm thu chất lượng. Có thể xuất CSV để đối chiếu/lưu trữ.</p></details>'+
 '<div class="c3d-work-row"><label>Lọc #ID<input data-work-filter type="search" placeholder="Ví dụ 38"></label><button data-work-export>Xuất CSV ngày</button></div><div class="c3d-work-table"><table><thead><tr><th>Job / #ID</th><th>Đã tác động</th><th>Còn thay đổi</th><th>CVAT báo lưu</th></tr></thead><tbody data-work-rows></tbody></table></div><div class="c3d-work-row"><button data-work-prev>Trước</button><span data-work-page></span><button data-work-next>Sau</button></div>';
 const $=s=>panel.querySelector(s);$('[data-work-date]').value=date;
 async function send(payload){if(!available)throw Error('Cần extension CVAT thật để lưu nhật ký; demo không tạo số liệu công việc');const response=await chrome.runtime.sendMessage({type:'C3D_WORK_LOG',payload:{date,...payload}});if(!response?.ok)throw Error(response?.error||'Không lưu được nhật ký');return response.result;}
 function fail(e){error=e.message;$('[data-work-status]').textContent='Nhật ký chưa ghi được: '+error;}
 function ranges(frames){const out=[];for(let i=0;i<frames.length;i++){const start=frames[i];while(i+1<frames.length&&frames[i+1]===frames[i]+1)i++;out.push(start===frames[i]?String(start):start+'–'+frames[i]);}return out.join(', ');}
 function render(){
  if(disposed||!state)return;
  $('[data-work-shift]').textContent=state.active?'Đang trong ca · từ '+new Date(state.active.start).toLocaleString():'Chưa vào ca · thay đổi ngoài ca không tính KPI';
  $('[data-work-in]').disabled=!!state.active;$('[data-work-out]').disabled=!state.active;
  if(!panel.querySelector('[data-work-goal]').contains(document.activeElement)){$('[data-work-target]').value=state.goal.target;$('[data-work-unit]').value=state.goal.unit;}
  $('[data-work-progress]').textContent=state.goal.target?state.achieved+' / '+state.goal.target+' · '+(state.remaining?'Còn '+state.remaining:'Đạt mục tiêu tự đặt'):'Chưa đặt KPI cho ngày này';$('[data-work-bar]').value=state.progress;
  for(const [selector,value] of [['cuboids',state.changed],['objects',state.changedObjects],['saved',state.saved],['time',Math.floor(state.activeMs/60000)+' phút']])$('[data-work-'+selector+']').textContent=value;
  const shifts=$('[data-work-shifts]');shifts.replaceChildren();for(const shift of state.shifts){const item=document.createElement('li');item.textContent=new Date(shift.start).toLocaleString()+' → '+(shift.end?new Date(shift.end).toLocaleString():'đang mở');shifts.append(item);}if(!state.shifts.length){const item=document.createElement('li');item.textContent='Không có ca bắt đầu trong ngày này.';shifts.append(item);}
  $('[data-work-decisions]').textContent='Gợi ý Batch: nhận '+state.accepted+' · bỏ qua rõ ràng '+state.rejected+' | Đã tác động '+state.touched+' cuboid · '+state.edits+' bản ghi thay đổi quan sát';
  $('[data-work-status]').textContent=error?'Nhật ký chưa ghi được: '+error:'Đã đọc nhật ký cục bộ · '+state.reverted+' cuboid về baseline · '+state.deleted+' bị xóa/outside · '+(state.uncertain||0)+' chưa đối chiếu được';
  const filter=$('[data-work-filter]').value.trim().replace(/^#/,''),items=state.objects.filter(o=>!filter||String(o.clientId)===filter);page=Math.min(page,Math.max(0,Math.ceil(items.length/20)-1));
  const tbody=$('[data-work-rows]');tbody.replaceChildren();
  for(const item of items.slice(page*20,page*20+20)){const tr=document.createElement('tr');for(const value of ['Job '+item.jobId+' · #'+item.clientId,item.frames.length,item.changedFrames.length+(item.global?' + track':''),item.savedFrames.length]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const detail=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='c3d-work-frame-list';td.textContent=item.origin+' · Frame đã tác động: '+(ranges(item.frames)||'thuộc tính toàn track');detail.append(td);tbody.append(tr,detail);}
  if(!items.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='Chưa có object được ghi nhận cho ngày/bộ lọc này.';row.append(cell);tbody.append(row);}
  $('[data-work-page]').textContent=(items.length?page+1:0)+' / '+Math.ceil(items.length/20)+' · '+items.length+' object';$('[data-work-prev]').disabled=page===0;$('[data-work-next]').disabled=(page+1)*20>=items.length;
 }
 async function refresh(){if(disposed||refreshing||!available)return;refreshing=true;try{const next=await send({op:'view'}),changed=next.active?.id!==activeId;state=next;activeId=next.active?.id||null;if(changed){baseline=null;scope='';if(activeId)schedule(true);}render();}catch(e){fail(e);}finally{refreshing=false;}}
 function schedule(reset=false){clearTimeout(timer);if(disposed||!activeId||paused)return;timer=setTimeout(()=>capture(reset).catch(fail),450);}
 function capture(reset=false,force=false){
  const task=scanQueue.catch(()=>{}).then(async()=>{
   if(disposed||paused||!force&&!activeId)return;
   const observingShift=activeId;const snap=env.snapshot();if(!snap?.connected||snap.mode==='demo')throw Error('Chỉ ghi khối lượng annotation trong editor CVAT native');
   const doc=await env.request('GET_WORK_DOCUMENT');if(disposed||paused||activeId!==observingShift||env.snapshot()?.jobId!==doc.jobId)return;
   const nextScope=doc.jobId+':'+doc.epoch,rows=new Map(doc.rows.map(r=>[r.objectKey+'@'+r.frame,r])),aliases=[];
   if(scope!==nextScope||reset){scope=nextScope;baseline=rows;lastSaved=doc.saved;ignored.clear();if(activeId)await send({op:'observe',id:epoch+':'+(++seq),shiftId:observingShift,epoch:doc.epoch,changes:[],aliases:[],reconcile:true,saved:!!doc.saved,states:doc.rows.map(r=>({objectKey:r.objectKey,frame:r.frame,hash:r.hash,present:r.present}))});return;}
   const before=new Map(baseline||[]);
   const anonymous=new Map([...before.values()].filter(p=>p.frame===null&&p.objectKey.includes(':new:')).map(p=>[p.kind+':'+p.clientId,p]));
   for(const r of rows.values())if(r.serverId!=null&&r.frame===null){const old=anonymous.get(r.kind+':'+r.clientId);if(old){aliases.push({from:old.objectKey,to:r.objectKey});for(const [key,p]of before)if(p.objectKey===old.objectKey){before.delete(key);before.set(r.objectKey+'@'+p.frame,{...p,objectKey:r.objectKey});}}}
   const changes=[];
   for(const key of new Set([...before.keys(),...rows.keys()])){const a=before.get(key),b=rows.get(key);if(a?.hash===b?.hash)continue;const identity=b||a;if(ignored.has(identity.kind+':'+identity.clientId+':'+identity.frame))continue;changes.push({objectKey:identity.objectKey,clientId:identity.clientId,frame:identity.frame,before:a?.hash||null,after:b?.hash||null,present:!!b?.present});}
   if(changes.length||aliases.length||doc.saved&&!lastSaved){state=await send({op:'observe',id:epoch+':'+(++seq),shiftId:observingShift,epoch:doc.epoch,changes,aliases,saved:!!doc.saved,states:doc.saved?doc.rows.map(r=>({objectKey:r.objectKey,frame:r.frame,hash:r.hash,present:r.present})):[]});error='';render();}
   baseline=rows;lastSaved=doc.saved;ignored.clear();
  });scanQueue=task;return task;
 }
 function csv(){if(!state)return;const rows=[['date','origin','job','clientID','touched_frames','changed_frames','native_saved_frames','observed_edits','frame_list','kpi_unit','kpi_target','kpi_achieved','active_minutes_day','batch_accepted_day','batch_rejected_day','shift_intervals_day'],...state.objects.map(o=>[date,o.origin,o.jobId,o.clientId,o.frames.length,o.changedFrames.length,o.savedFrames.length,o.edits,o.frames.join(' '),state.goal.unit,state.goal.target,state.achieved,Math.floor(state.activeMs/60000),state.accepted,state.rejected,state.shifts.map(s=>new Date(s.start).toLocaleString()+' → '+(s.end?new Date(s.end).toLocaleString():'open')).join(' | ')])];if(rows.length===1)rows.push([date,'','','',0,0,0,0,'',state.goal.unit,state.goal.target,state.achieved,Math.floor(state.activeMs/60000),state.accepted,state.rejected,state.shifts.map(s=>new Date(s.start).toLocaleString()+' → '+(s.end?new Date(s.end).toLocaleString():'open')).join(' | ')]);const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='cvat-work-'+date+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function run(fn){return async()=>{try{error=await fn()||'';render();}catch(e){fail(e);}};}
 $('[data-work-in]').onclick=run(async()=>{await capture(true,true);if(!baseline)throw Error('Ca hoặc editor vừa đổi; hãy thử vào ca lại');state=await send({op:'in',id:epoch+':shift:'+Date.now()});activeId=state.active?.id;lastActivity=Date.now();state=await send({op:'observe',id:epoch+':'+(++seq),shiftId:activeId,changes:[],aliases:[],reconcile:true,saved:!!lastSaved,states:[...(baseline?.values()||[])].map(r=>({objectKey:r.objectKey,frame:r.frame,hash:r.hash,present:r.present}))});});
 $('[data-work-out]').onclick=run(async()=>{let warning='';try{await capture();}catch(e){warning=e.message;}state=await send({op:'out'});activeId=null;baseline=null;return warning?'Đã ra ca; thay đổi cuối chưa đối chiếu được: '+warning:'';});
 $('[data-work-set]').onclick=run(async()=>{const target=$('[data-work-target]').valueAsNumber;if(!Number.isInteger(target))throw Error('Nhập KPI là số nguyên, 0 để không đặt mục tiêu');state=await send({op:'goal',target,unit:$('[data-work-unit]').value});});
 $('[data-work-export]').onclick=run(async()=>{if(activeId&&date===api.dayKey(Date.now()))await capture();state=await send({op:'view'});csv();});
 $('[data-work-date]').onchange=()=>{date=$('[data-work-date]').value;followToday=date===api.dayKey(Date.now());page=0;refresh();};$('[data-work-filter]').oninput=()=>{page=0;render();};$('[data-work-prev]').onclick=()=>{page--;render();};$('[data-work-next]').onclick=()=>{page++;render();};
 const controller=new AbortController();for(const name of ['pointerdown','keydown','wheel'])window.addEventListener(name,()=>lastActivity=Date.now(),{signal:controller.signal,passive:true});
 const storageChanged=(changes,area)=>{if(area==='local'&&(changes[api?.KEY+':'+location.origin]||Object.keys(changes).some(k=>k.startsWith((api?.DAY_PREFIX||'c3d.worklog.day.')+encodeURIComponent(location.origin)+'.')))){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,150);}};
 if(available){chrome.storage?.onChanged?.addListener(storageChanged);refresh();}else{for(const b of panel.querySelectorAll('button,input,select'))b.disabled=true;$('[data-work-status]').textContent='Mở job bằng extension để dùng nhật ký. Demo không tạo số liệu KPI.';}
 const beatTimer=setInterval(()=>{if(disposed)return;if(activeId)capture().catch(fail);if(followToday&&date!==api.dayKey(Date.now())){date=api.dayKey(Date.now());$('[data-work-date]').value=date;}refresh();if(activeId&&document.visibilityState==='visible'&&document.hasFocus()&&Date.now()-lastActivity<300000)send({op:'beat',working:true}).then(s=>{state=s;render();}).catch(fail);},20000);
 const writeTypes=new Set(['AUTO_FIT','AUTO_ADJUST','SNAP_GROUND','MOVE_TO_MOUSE','ROTATE','SET_LABEL','BATCH_APPLY','BATCH_SIZE_APPLY']);
 return {
  onSnapshot(s){if(activeId){const key=s.sessionId+':'+s.jobId+':'+s.revision+':'+s.saveState;if(key!==this.lastSnapshot){this.lastSnapshot=key;schedule();}}},
  before(type){if(['BATCH_APPLY','BATCH_SIZE_APPLY'].includes(type)){paused++;clearTimeout(timer);}if(type==='IMPORT_ALL_ANNOTATIONS'){paused++;clearTimeout(timer);baseline=null;}},
  after(type){if(['BATCH_APPLY','BATCH_SIZE_APPLY'].includes(type)){paused=Math.max(0,paused-1);schedule();}if(type==='IMPORT_ALL_ANNOTATIONS'){paused=Math.max(0,paused-1);baseline=null;scope='';schedule(true);}},
  result(type,p,result){
   if(type==='BATCH_SIZE_OPEN')batchTargets.set(result.token,result.clientId);if(type==='BATCH_SIZE_APPLY'){const id=batchTargets.get(p.token);for(const frame of result.boundaryFrames||[])ignored.add('tracks:'+id+':'+frame);}
   if(writeTypes.has(type))schedule();
   const key=p.token+':'+p.frame;
   if(type==='BATCH_FRAME')proposals.set(key,result.status==='proposal'&&!result.protected?'auto':'other');
   if(type==='BATCH_DRAFT')proposals.set(key,'manual');
   if(type==='BATCH_RESET_DRAFT')proposals.set(key,result.status==='proposal'&&!result.protected?'auto':'other');
   if(type==='BATCH_PROTECT'&&activeId&&proposals.get(key)==='auto')send({op:'decision',key,value:'rejected'}).then(s=>{state=s;render();}).catch(fail);
   if(type==='BATCH_APPLY'&&activeId&&!result.error)for(const frame of result.appliedFrames||[]){const k=p.token+':'+frame;if(proposals.get(k)==='auto')send({op:'decision',key:k,value:'accepted'}).then(s=>{state=s;render();}).catch(fail);}
  },
  flush(){clearTimeout(timer);return capture();},
  dispose(){disposed=true;controller.abort();clearTimeout(timer);clearTimeout(refreshTimer);clearInterval(beatTimer);if(available)chrome.storage?.onChanged?.removeListener(storageChanged);}
 };
}
root.__C3D_WORK_UI={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
