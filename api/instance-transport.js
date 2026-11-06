'use strict';
const https=require('node:https');

// Use the native HTTPS transport for the private Azure function boundary.
// It makes a single request, rejects redirects, and bounds actual response bytes.
function instanceRequest(url,options){
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:options.method,headers:{...options.headers,
   'Content-Length':Buffer.byteLength(options.body||'')}},response=>{
   if(response.statusCode>=300&&response.statusCode<400){response.destroy();reject(Error('backend_redirect'));return;}
   const chunks=[];let bytes=0;
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){response.destroy(Error('backend_response_limit'));return;}chunks.push(chunk);});
   response.on('error',reject);
   response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,
    headers:{'Content-Type':response.headers['content-type']||'application/json'}})));
  });
  const abort=()=>req.destroy(Error('backend_timeout'));
  options.signal?.addEventListener('abort',abort,{once:true});
  req.on('error',reject);
  req.on('close',()=>options.signal?.removeEventListener('abort',abort));
  if(options.signal?.aborted){abort();return;}
  req.end(options.body);
 });
}
module.exports={instanceRequest};
