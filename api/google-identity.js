'use strict';
const {createPublicKey,verify}=require('node:crypto');
class IdentityError extends Error {}
class IdentityUnavailable extends Error {}
async function googleKeys(){
 const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new IdentityUnavailable();
 const text=await response.text();if(Buffer.byteLength(text)>32768)throw new IdentityUnavailable();
 const data=JSON.parse(text);const maxAge=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300);
 return {keys:data.keys,maxAge};
}
function createGoogleVerifier({clientId,fetchKeys=googleKeys,now=Date.now}){
 let cached=null,pending=null,lastForcedRefresh=0;
 async function refresh(){
  if(!pending)pending=(async()=>{try{const data=await fetchKeys();if(!Array.isArray(data.keys)||data.keys.length>10)throw new IdentityUnavailable();cached={keys:data.keys,until:now()+Math.min(3600,Math.max(0,data.maxAge??300))*1000};}catch{throw new IdentityUnavailable();}finally{pending=null;}})();
  await pending;
 }
 return async credential=>{
  if(!clientId)throw new IdentityUnavailable();
  if(typeof credential!=='string'||credential.length>8192)throw new IdentityError();
  const parts=credential.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[\w-]+$/.test(p)))throw new IdentityError();
  let header,payload;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));payload=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw new IdentityError();}
  const seconds=Math.floor(now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||payload.aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)||!Number.isInteger(payload.exp)||payload.exp<=seconds||!Number.isInteger(payload.iat)||payload.iat>seconds+60||payload.iat<seconds-7200||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255)throw new IdentityError();
  if(!cached||cached.until<=now())await refresh();
  const findKey=()=>cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  let key=findKey();
  if(!key&&now()-lastForcedRefresh>60000){lastForcedRefresh=now();await refresh();key=findKey();}
  if(!key)throw new IdentityError();
  try{if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new IdentityError();}catch{throw new IdentityError();}
  return {sub:payload.sub};
 };
}
module.exports={createGoogleVerifier,IdentityError,IdentityUnavailable};
