'use strict';
const {generateKeyPairSync,sign,randomUUID}=require('node:crypto');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const clientId='123456789-test.apps.googleusercontent.com';
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
function credential(sub='test-user',extra={},kid='test-key') {
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub,iat:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+3600,...extra})).toString('base64url');
 const input=header+'.'+payload;return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
}
class TestStore {
 constructor(){this.state=null;this.revision=0;}
 async read(){return {state:structuredClone(this.state),etag:this.state?String(this.revision):null};}
 async write(state,etag){if((this.state?String(this.revision):null)!==etag)return false;this.state=structuredClone(state);this.revision++;return true;}
}
async function call(handler,method='GET',body,query={},headers={origin:'https://officiallypointless.com'}) {
 const context={};await handler(context,{method,body,query,headers});return context.res;
}
const submission=(feature='last-word',extra={})=>({feature,name:'Alex',text:'I was right about the snacks.',requestId:randomUUID(),...extra});
const auth=(sub=randomUUID())=>({origin:'https://officiallypointless.com',authorization:'Bearer '+credential(sub)});
module.exports={TestStore,call,submission,auth,credential,clientId,jwk};
