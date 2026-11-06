'use strict';
const MAX_BYTES=2*1024*1024;
function createBlobStore(url,{request=fetch,maxBytes=MAX_BYTES}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<MAX_BYTES||maxBytes>4*1024*1024)return null;
 let parsed;try{parsed=new URL(url);}catch{return null;}
 if(parsed.protocol!=='https:'||!/^([a-z0-9]{3,24})\.blob\.core\.windows\.net$/.test(parsed.hostname)||parsed.username||parsed.password||parsed.hash||!parsed.searchParams.has('sig')||parsed.pathname.split('/').length!==3)return null;
 const headers={'x-ms-version':'2023-11-03'};
 return {
  async read(){
   const response=await request(parsed.href,{headers,signal:AbortSignal.timeout(5000)});
   if(response.status===404)return {state:null,etag:null};
   if(!response.ok||!response.headers.get('etag'))throw Error('storage unavailable');
   const reader=response.body.getReader();let size=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('storage limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   return {state:JSON.parse(Buffer.concat(chunks).toString('utf8')),etag:response.headers.get('etag')};
  },
  async write(state,etag){
   const body=JSON.stringify(state);if(Buffer.byteLength(body)>maxBytes)throw Error('storage limit');
   const response=await request(parsed.href,{method:'PUT',headers:{...headers,'x-ms-blob-type':'BlockBlob','Content-Type':'application/json',...(etag?{'If-Match':etag}:{'If-None-Match':'*'})},body,signal:AbortSignal.timeout(5000)});
   if(response.status===412||response.status===409)return false;
   if(!response.ok)throw Error('storage unavailable');return true;
  }
 };
}
module.exports={createBlobStore,MAX_BYTES};
