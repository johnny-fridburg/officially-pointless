'use strict';
(()=>{
 const form=document.getElementById('instance-form');if(!form)return;
 const recipient=document.getElementById('instance-recipient'),giver=document.getElementById('instance-giver');
 const image=document.getElementById('instance-preview'),caption=document.getElementById('instance-caption');
 const status=document.getElementById('instance-status'),previewButton=document.getElementById('instance-preview-button');
 const deliveryForm=document.getElementById('instance-delivery-form'),deliverButton=document.getElementById('instance-deliver-button');
 const license=document.getElementById('instance-license'),downloads=document.getElementById('instance-downloads');
 const sample=image.src,urls=[];let token=null,revision=0,pending=null;
 const apiBase=location.hostname==='promotions.officiallypointless.com'?'https://officiallypointless.com':'';
 const messages={invalid_name:'Enter a recipient and giver name, up to 60 characters each.',
  unsupported_name_characters:'This edition supports Latin letters, numbers and ordinary punctuation. Please adjust the names.',
  payment_required:'This key does not verify a paid purchase of this title. Check your Gumroad receipt.',
  payment_unavailable:'Payment verification is temporarily unavailable. Try again shortly.',
  purchase_already_assigned:'This purchase already has its finished certificate. Enter the original names to download it again, or contact support.',
  invalid_preview:'Create a fresh watermarked preview before downloading.',
  product_not_open:'Finished delivery for this product is not open yet.'};
 function clearDownloads(){downloads.hidden=true;while(urls.length)URL.revokeObjectURL(urls.pop());
  for(const id of ['instance-png','instance-pdf'])document.getElementById(id).removeAttribute('href');}
 function invalidate(){revision++;pending?.abort();pending=null;token=null;deliverButton.disabled=true;
  previewButton.disabled=false;image.src=sample;caption.textContent='Example certificate. Create a new preview for these names.';
  clearDownloads();status.textContent='Create a watermarked preview for the names you want on your finished certificate.';}
 recipient.addEventListener('input',invalidate);giver.addEventListener('input',invalidate);
 async function request(payload){
  const controller=new AbortController();pending=controller;const timer=setTimeout(()=>controller.abort(),35000);
  try{const response=await fetch(apiBase+'/api/certificates',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    credentials:'omit',cache:'no-store',body:JSON.stringify(payload),signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(messages[data?.error]||'The certificate service is temporarily unavailable. Try again shortly.');return data;
  }finally{clearTimeout(timer);}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;invalidate();const current=revision;
  previewButton.disabled=true;status.textContent='Creating your watermarked preview on our server…';
  try{const data=await request({action:'preview',sku:form.dataset.instanceSku,recipient:recipient.value,giver:giver.value});
   if(current!==revision)return;
   if(typeof data.instance!=='string'||typeof data.preview!=='string'||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.preview))throw Error('The preview could not be loaded. Try again.');
   token=data.instance;image.src=data.preview;caption.textContent='Your watermarked preview. Finished files are released after verified payment.';
   deliverButton.disabled=false;status.textContent='Preview ready. Check the names, then purchase this title or enter your purchase key.';
  }catch(error){if(current===revision)status.textContent=error.name==='AbortError'?'The preview timed out. Try again.':error.message;}
  finally{if(current===revision){previewButton.disabled=false;pending=null;}}
 });
 function download(id,value,type,filename){
  const bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type}));
  urls.push(url);const link=document.getElementById(id);link.href=url;link.download=filename;
 }
 deliveryForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!token||!deliveryForm.reportValidity())return;const current=revision;
  deliverButton.disabled=true;previewButton.disabled=true;recipient.disabled=true;giver.disabled=true;clearDownloads();status.textContent='Verifying payment and fixing these names for your finished certificate…';
  try{const data=await request({action:'deliver',instance:token,license:license.value.trim()});if(current!==revision)return;
   if(typeof data.png!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.png)||typeof data.pdf!=='string'||!/^JVBERi0[A-Za-z0-9+/=]*$/.test(data.pdf)||
    data.filename!==form.dataset.instanceSku.replace(/^certificate-/,''))throw Error('The finished files could not be loaded. Try again.');
   download('instance-png',data.png,'image/png',data.filename+'.png');download('instance-pdf',data.pdf,'application/pdf',data.filename+'.pdf');
   downloads.hidden=false;license.value='';status.textContent='Payment verified. Your finished PNG and PDF are ready below.';
  }catch(error){if(current===revision)status.textContent=error.name==='AbortError'?'Verification timed out. Try again with the same names.':error.message;}
  finally{if(current===revision){deliverButton.disabled=!token;previewButton.disabled=false;recipient.disabled=false;giver.disabled=false;pending=null;}}
 });
 addEventListener('pagehide',()=>{pending?.abort();clearDownloads();license.value='';token=null;});
})();
