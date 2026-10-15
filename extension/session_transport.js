/* Isolated content world: same-origin requests retain CVAT's session/CSRF.
 * Runtime-only messages; no API operation or credentials use CustomEvent. */
function createSessionTransport(env) {
 let importSubmitted=false;
 const context=()=>{
  const s=env.snapshot(),match=new URL(env.url()).pathname.match(/\/jobs\/(\d+)(?:\/|$)/);
  if(!s?.connected||!match||Number(match[1])!==s.jobId)throw new Error('CVAT editor is not ready');
  return s;
 };
 return async request=>{
  const s=context(),origin=new URL(env.url()).origin;
  if(request.origin!==origin||request.jobId!==s.jobId)throw new Error('CVAT job changed');
  const root='/api/jobs/'+s.jobId;
  const mutable=['export','import'].includes(request.operation);
  if(mutable&&importSubmitted)throw new Error('Import already submitted; reload CVAT before further operations');
  if(mutable&& !['saved','local'].includes(s.saveState))throw new Error('Save CVAT changes before Import/Export');
  let path,method='GET',body;
  switch(request.operation){
   case 'context':return {jobId:s.jobId,saveState:s.saveState};
   case 'user':path='/api/users/self';break;
   case 'formats':path='/api/server/annotation/formats';break;
   case 'status':path='/api/requests/'+encodeURIComponent(request.requestId);break;
   case 'export':path=root+'/dataset/export?'+new URLSearchParams({format:request.format,save_images:'false',location:'local'});method='POST';break;
   case 'import':
    if(request.confirmJob!==s.jobId||!s.capabilities?.edit)throw new Error('Confirm the editable destination job');
    if(!request.file||request.file.bytes.length>8*1024*1024)throw new Error('File exceeds 8 MiB transfer limit');
    body=new FormData();body.append('annotation_file',new Blob([Uint8Array.from(request.file.bytes)]),request.file.name);
    path=root+'/annotations/?'+new URLSearchParams({format:request.format,location:'local'});method='POST';break;
   case 'download':{
    const url=new URL(request.url,origin);
    if(url.origin!==origin||!(url.pathname.startsWith(root+'/dataset/')||url.pathname.startsWith('/api/requests/')))throw new Error('Unsafe download URL');
    path=url.pathname+url.search;break;
   }
   default:throw new Error('Unsupported session operation');
  }
  const csrf=env.cookie().split(';').map(x=>x.trim()).find(x=>x.startsWith('csrftoken='))?.slice(10);
  const headers={};if(method!=='GET'&&csrf)headers['X-CSRFToken']=decodeURIComponent(csrf);
  if(request.operation==='import')importSubmitted=true;
  const response=await env.fetch(origin+path,{method,body,headers,credentials:'include',redirect:'error'});
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Session expired, CSRF rejected, or permission denied ('+response.status+')':'CVAT API error '+response.status);
  if(context().jobId!==s.jobId)throw new Error('Job changed; check server Requests before retrying');
  if(request.operation==='download'){
   const buffer=await response.arrayBuffer();if(buffer.byteLength>8*1024*1024)throw new Error('Download exceeds 8 MiB; use CVAT native export');
   return {bytes:Array.from(new Uint8Array(buffer))};
  }
  return response.status===204?{}:await response.json();
 };
}
if(typeof module!=='undefined')module.exports={createSessionTransport};
if(typeof window!=='undefined')window.__C3D_CREATE_SESSION_TRANSPORT=createSessionTransport;
