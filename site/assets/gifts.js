'use strict';
(() => {
  const CATALOG=[{"currency": "USD", "image": "/assets/certificates/minister-of-unopened-tabs.png", "kind": "digital-certificate", "name": "Minister of Unopened Tabs", "path": "/certificates/minister-of-unopened-tabs/", "permalink": "pointless-minister-of-unopened-tabs", "priceUsd": 19, "sku": "certificate-minister-of-unopened-tabs"}, {"currency": "USD", "image": "/assets/certificates/secretary-of-one-more-coffee.png", "kind": "digital-certificate", "name": "Secretary of One More Coffee", "path": "/certificates/secretary-of-one-more-coffee/", "permalink": "pointless-secretary-of-one-more-coffee", "priceUsd": 19, "sku": "certificate-secretary-of-one-more-coffee"}, {"currency": "USD", "image": "/assets/certificates/director-of-unnecessary-meetings.png", "kind": "digital-certificate", "name": "Director of Unnecessary Meetings", "path": "/certificates/director-of-unnecessary-meetings/", "permalink": "pointless-director-of-unnecessary-meetings", "priceUsd": 19, "sku": "certificate-director-of-unnecessary-meetings"}, {"currency": "USD", "image": "/assets/certificates/chief-of-the-snack-drawer.png", "kind": "digital-certificate", "name": "Chief of the Snack Drawer", "path": "/certificates/chief-of-the-snack-drawer/", "permalink": "pointless-chief-of-the-snack-drawer", "priceUsd": 19, "sku": "certificate-chief-of-the-snack-drawer"}, {"currency": "USD", "image": "/assets/certificates/commissioner-of-replying-tomorrow.png", "kind": "digital-certificate", "name": "Commissioner of Replying Tomorrow", "path": "/certificates/commissioner-of-replying-tomorrow/", "permalink": "pointless-commissioner-of-replying-tomorrow", "priceUsd": 19, "sku": "certificate-commissioner-of-replying-tomorrow"}, {"currency": "USD", "image": "/assets/departments/make-it-worse.png", "kind": "online-department", "name": "Bad Taste Department", "path": "/departments/make-it-worse/", "permalink": "pointless-make-it-worse", "priceUsd": 19, "sku": "department-make-it-worse"}, {"currency": "USD", "image": "/assets/departments/silence.png", "kind": "online-department", "name": "A Minute of Silence", "path": "/departments/silence/", "permalink": "pointless-silence", "priceUsd": 19, "sku": "department-silence"}, {"currency": "USD", "image": "/assets/departments/loading.png", "kind": "online-department", "name": "The Sponsored Loading Bar", "path": "/departments/loading/", "permalink": "pointless-loading", "priceUsd": 19, "sku": "department-loading"}, {"currency": "USD", "image": "/assets/departments/last-word.png", "kind": "online-department", "name": "The Last Word", "path": "/departments/last-word/", "permalink": "pointless-last-word", "priceUsd": 19, "sku": "department-last-word"}, {"currency": "USD", "image": "/assets/departments/museum.png", "kind": "online-department", "name": "The Ordinary Museum", "path": "/departments/museum/", "permalink": "pointless-museum", "priceUsd": 19, "sku": "department-museum"}, {"currency": "USD", "image": "/assets/departments/golden-error.png", "kind": "online-department", "name": "A Gold-Plated Error", "path": "/departments/golden-error/", "permalink": "pointless-golden-error", "priceUsd": 19, "sku": "department-golden-error"}, {"currency": "USD", "image": "/assets/departments/button.png", "kind": "online-department", "name": "The Over-Sponsored Button", "path": "/departments/button/", "permalink": "pointless-button", "priceUsd": 19, "sku": "department-button"}, {"currency": "USD", "image": "/assets/departments/empty-wing.png", "kind": "online-department", "name": "The Empty Wing", "path": "/departments/empty-wing/", "permalink": "pointless-empty-wing", "priceUsd": 19, "sku": "department-empty-wing"}, {"currency": "USD", "image": "/assets/departments/unnecessary-ribbon.png", "kind": "online-department", "name": "The Unnecessary Ribbon", "path": "/departments/unnecessary-ribbon/", "permalink": "pointless-unnecessary-ribbon", "priceUsd": 19, "sku": "department-unnecessary-ribbon"}, {"currency": "USD", "image": "/assets/departments/invisible-monument.png", "kind": "online-department", "name": "The Invisible Monument", "path": "/departments/invisible-monument/", "permalink": "pointless-invisible-monument", "priceUsd": 19, "sku": "department-invisible-monument"}];
  const bySku=new Map(CATALOG.map(product=>[product.sku,product]));
  const ROOT='https://officiallypointless.com';
  const local=location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.hostname.endsWith('.azurestaticapps.net');
  const API=(local?location.origin:ROOT)+'/api/gifts/';
  const page=document.querySelector('[data-gift-page]')?.dataset.giftPage;
  const $=id=>document.getElementById(id);
  const handlePattern=/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
  const giftUrl=id=>ROOT+'/gifts/view/?id='+id;
  const profileUrl=handle=>ROOT+'/people/?handle='+encodeURIComponent(handle);
  const node=(tag,className,text)=>{
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined)element.textContent=text;
    return element;
  };
  function giftValid(gift){
    const product=bySku.get(gift?.productSku);
    return Boolean(product&&/^[a-f0-9]{24}$/.test(gift.id)&&typeof gift.name==='string'&&gift.name.length>0&&gift.name.length<=70&&
      typeof gift.recipientHandle==='string'&&handlePattern.test(gift.recipientHandle)&&typeof gift.text==='string'&&gift.text.length<=240&&
      Number.isSafeInteger(gift.createdAt)&&gift.createdAt>0&&gift.productName===product.name&&gift.kind===product.kind&&gift.image===product.image);
  }
  async function request(action,{method='GET',body,key,query}={}){
    const headers={Accept:'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(key)headers['X-Pointless-License']=key;
    const response=await fetch(API+action+(query?'?'+query:''),{method,headers,
      ...(body!==undefined&&{body:JSON.stringify(body)}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    let data;try{data=await response.json();}catch{throw Error('gift_unavailable');}
    if(!response.ok)throw Error(data?.error||'gift_unavailable');
    return data;
  }
  const messages={
    payment_required:'A valid paid purchase key is required. Refunded and test purchases do not grant access.',
    payment_unavailable:'Purchase verification is temporarily unavailable. No public gift has been created.',
    product_not_purchased:'This key does not include the selected product.',
    invalid_submission:'Check the public name, handle, message and permission confirmation.',
    handle_conflict:'That public handle already uses a different name. Choose the existing profile’s name or another handle.',
    gift_already_used:'This purchase already has an active public page for that product. Remove it before making a replacement.',
    gift_removed:'That gift has been removed. Start a new publication to create a replacement.',
    gift_not_found:'This public gift or profile is unavailable or has been removed.',
    publication_limit:'Public gifting is temporarily limited. Please try again later; no duplicate gift has been created.',
    public_gifting_not_open:'New public gifting is not open yet. Existing public gifts remain readable.',
    retry_changed:'The previous request used different details. Start a new publication.',
    gift_full:'Public gifting capacity is temporarily full. Please contact support.',
  };
  const explain=error=>messages[error?.message]||'Public gifting is temporarily unavailable. Please try again later.';
  function card(gift){
    const product=bySku.get(gift.productSku),article=node('article','public-gift-card');
    article.dataset.giftId=gift.id;
    const link=node('a');link.href=giftUrl(gift.id);
    const image=node('img');image.src=product.image;image.alt='Fictional '+product.name+' gift presentation';image.width=1200;image.height=800;image.loading='lazy';
    link.append(image,node('h3','',gift.name+' was gifted '+product.name));article.append(link);
    if(gift.text)article.append(node('p','',gift.text));
    const profile=node('a','text-link','@'+gift.recipientHandle+' · View their collection');profile.href=profileUrl(gift.recipientHandle);article.append(profile);
    article.append(node('p','gift-card-time','Shared '+new Date(gift.createdAt).toLocaleString()));
    return article;
  }
  function drawCards(target,gifts){
    if(!target)return;
    target.replaceChildren(...gifts.filter(giftValid).map(card));
  }
  function boards(data){
    if($('people-board')){
      const rows=(data.people||[]).filter(profile=>typeof profile.name==='string'&&handlePattern.test(profile.handle)&&
        Number.isInteger(profile.distinctProducts)&&profile.distinctProducts>0&&profile.distinctProducts<=CATALOG.length);
      $('people-board').replaceChildren(...rows.slice(0,10).map((profile,index)=>{
        const row=node('div','gift-rank'),title=node('div','gift-rank-title'),link=node('a','',profile.name);
        link.href=profileUrl(profile.handle);title.append(link,node('small','','@'+profile.handle));
        row.append(node('span','gift-rank-number',String(index+1).padStart(2,'0')),title,node('span','gift-rank-score',profile.distinctProducts+' / 15'));return row;
      }));
      if(!rows.length)$('people-board').append(node('p','fine','Public collections will appear as gifts are shared.'));
    }
    if($('products-board')){
      const rows=(data.products||[]).filter(product=>bySku.has(product.sku)&&Number.isInteger(product.recipientCount)&&product.recipientCount>0);
      $('products-board').replaceChildren(...rows.slice(0,10).map((product,index)=>{
        const meta=bySku.get(product.sku),row=node('div','gift-rank'),title=node('div','gift-rank-title'),link=node('a','',meta.name);
        link.href=ROOT+meta.path;title.append(link,node('small','','Public recipient profiles'));
        row.append(node('span','gift-rank-number',String(index+1).padStart(2,'0')),title,node('span','gift-rank-score',String(product.recipientCount)));return row;
      }));
      if(!rows.length)$('products-board').append(node('p','fine','Published gifts will shape this board.'));
    }
  }
  const cursor=new URLSearchParams(location.search).get('cursor');
  function gallery(data){
    boards(data);
    if(page!=='gallery')return;
    const gifts=(data.gifts||[]).filter(giftValid);drawCards($('public-gifts'),gifts);
    $('gift-wall-status').textContent=gifts.length?'Public gifts, shared with permission.':'No public gifts are listed yet. Private gifts stay private.';
    const older=$('older-gifts');older.hidden=!data.cursor;
    if(data.cursor)older.href='/gifts/?cursor='+encodeURIComponent(data.cursor);
  }
  const layer=$('gift-notification-layer'),stack=$('gift-toast-stack'),toggle=$('gift-notification-toggle');
  const seen=new Set();let initialized=false,watermark=0,muted=false,pollTimer=null,polling=false,pollEpoch=0,active=true;
  function notify(gift){
    if(!giftValid(gift)||muted||!stack)return;
    const toast=node('article','gift-toast');toast.dataset.giftId=gift.id;
    const link=node('a');link.href=giftUrl(gift.id);
    const text=node('strong','',gift.name+' was gifted '+bySku.get(gift.productSku).name);text.dataset.giftText='';
    link.append(text,node('small','','A newly shared public gift · @'+gift.recipientHandle));
    const dismiss=node('button','gift-toast-dismiss','×');dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss gift notification');dismiss.addEventListener('click',()=>toast.remove());
    toast.append(link,dismiss);stack.prepend(toast);
    while(stack.children.length>3)stack.lastElementChild.remove();
    setTimeout(()=>toast.remove(),8000);
  }
  function receive(data){
    if(!Array.isArray(data.gifts)||!Array.isArray(data.people)||!Array.isArray(data.products))throw Error('gift_unavailable');
    const gifts=data.gifts.filter(giftValid),previous=watermark;
    if(layer)layer.hidden=false;if(toggle)toggle.hidden=false;
    if(initialized){for(const gift of [...gifts].reverse())if(!seen.has(gift.id)&&gift.createdAt>=previous)notify(gift);}
    for(const gift of gifts){seen.add(gift.id);watermark=Math.max(watermark,gift.createdAt);}
    initialized=true;
    if(page==='gallery'&&!cursor)gallery(data);else boards(data);
  }
  async function poll(){
    if(polling||document.hidden||!active)return;
    const epoch=pollEpoch;polling=true;
    try{const data=await request('feed',{query:'limit=50'});if(epoch===pollEpoch&&active)receive(data);}
    catch(error){if(epoch===pollEpoch&&active&&page==='gallery'&&!initialized)$('gift-wall-status').textContent=explain(error);}
    finally{if(epoch===pollEpoch){polling=false;clearTimeout(pollTimer);if(active)pollTimer=setTimeout(poll,20000);}}
  }
  if(toggle)toggle.addEventListener('click',()=>{
    muted=!muted;toggle.setAttribute('aria-pressed',String(muted));toggle.textContent=muted?'Enable gift updates':'Mute gift updates';if(muted)stack.replaceChildren();
  });
  document.addEventListener('visibilitychange',()=>{clearTimeout(pollTimer);if(!document.hidden)poll();});
  window.addEventListener('pagehide',()=>{
    active=false;pollEpoch++;polling=false;clearTimeout(pollTimer);stack?.replaceChildren();
    if(page==='create'){availabilityEpoch++;availabilityKnown=false;creationEnabled=false;clearAccess();$('gift-removal-key').value='';$('gift-removal-id').value='';$('gift-access-status').textContent='Verify your purchase again to continue.';}
  });
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    active=true;initialized=false;watermark=0;seen.clear();poll();
    if(page==='create'){clearAccess();$('gift-removal-key').value='';$('gift-removal-id').value='';refreshAvailability();}
  });
  poll();
  if(page==='gallery'&&cursor)request('feed',{query:'limit=50&cursor='+encodeURIComponent(cursor)}).then(gallery).catch(error=>$('gift-wall-status').textContent=explain(error));
  async function copy(url,target){
    try{await navigator.clipboard.writeText(url);target.textContent='Link copied';}
    catch{target.textContent='Copy this link: '+url;}
  }
  async function loadProfile(){
    const handle=new URLSearchParams(location.search).get('handle')?.trim().toLowerCase();
    if(!handlePattern.test(handle||'')){$('profile-status').textContent='Choose a public profile from the gift wall.';return;}
    try{
      const data=await request('profile',{query:'handle='+encodeURIComponent(handle)}),profile=data.profile;
      if(!profile||profile.handle!==handle||typeof profile.name!=='string'||!Array.isArray(data.gifts))throw Error('gift_unavailable');
      $('profile-name').textContent=profile.name;$('profile-handle').textContent='@'+profile.handle;
      $('profile-score').textContent=profile.distinctProducts+' / 15 different Pointless gifts collected.';
      $('profile-status').textContent=profile.totalGifts+' active public '+(profile.totalGifts===1?'gift.':'gifts.');
      drawCards($('profile-gifts'),data.gifts);document.title=profile.name+' — Officially Pointless public collection';
      $('copy-profile-link').hidden=false;$('copy-profile-link').addEventListener('click',()=>copy(profileUrl(handle),$('copy-profile-link')));
    }catch(error){$('profile-status').textContent=explain(error);}
  }
  async function loadGift(){
    const id=new URLSearchParams(location.search).get('id');
    if(!/^[a-f0-9]{24}$/.test(id||'')){$('public-gift-status').textContent='Open a gift from the public wall.';return;}
    try{
      const data=await request('view',{query:'id='+id});if(!giftValid(data.gift))throw Error('gift_unavailable');
      const gift=data.gift;$('public-gift-heading').textContent=gift.name+' was gifted '+gift.productName;
      const rendered=card(gift);rendered.classList.add('gift-detail-card');$('public-gift-result').replaceChildren(rendered);
      $('public-gift-status').textContent='Shared publicly with the recipient’s permission. Fictional honors; no real authority.';
      document.title=gift.name+' was gifted '+gift.productName+' — Officially Pointless';
      $('copy-gift-link').hidden=false;$('copy-gift-link').addEventListener('click',()=>copy(giftUrl(id),$('copy-gift-link')));
    }catch(error){$('public-gift-status').textContent=explain(error);}
  }
  let purchaseKey='',creationEnabled=false,allowedProducts=[],ownedGifts=[],publicationRequestId=null,accessEpoch=0,availabilityEpoch=0,availabilityKnown=false,publicReadEnabled=false;
  function clearAccess(clearInput=true){accessEpoch++;purchaseKey='';allowedProducts=[];ownedGifts=[];publicationRequestId=null;if(clearInput)$('gift-key').value='';$('gift-workspace').replaceChildren();$('gift-workspace').hidden=true;$('gift-verify-button').disabled=!availabilityKnown||!publicReadEnabled;}
  function inputField(form,label,id,{maxLength=70,required=true,type='text'}={}){
    const caption=node('label','',label);caption.htmlFor=id;const input=node('input');input.id=id;input.maxLength=maxLength;input.required=required;input.type=type;input.autocomplete='off';form.append(caption,input);return input;
  }
  function drawEditor(){
    const workspace=$('gift-workspace');workspace.replaceChildren();workspace.hidden=false;
    const forget=node('button','linkbutton','Forget purchase key');forget.type='button';forget.addEventListener('click',()=>{clearAccess();$('gift-access-status').textContent='Purchase key forgotten. Verify a key to recover your purchased products.';});workspace.append(forget);
    const form=node('form','gift-form');form.id='gift-editor';
    const label=node('label','','Purchased product');label.htmlFor='gift-product';const select=node('select');select.id='gift-product';
    for(const product of allowedProducts){const option=node('option','',product.name);option.value=product.sku;select.append(option);}
    const preferred=new URLSearchParams(location.search).get('product');if(allowedProducts.some(p=>p.sku===preferred))select.value=preferred;
    form.append(label,select);
    const name=inputField(form,'Recipient’s public name','recipient-name');
    const handle=inputField(form,'Recipient’s public handle','recipient-handle',{maxLength:32});handle.pattern='[A-Za-z0-9](?:[A-Za-z0-9-]{1,30})[A-Za-z0-9]';
    form.append(node('p','gift-handle-note','Choose a distinct handle so different people with the same name stay separate. Use a nickname your recipient is happy to show publicly.'));
    const noteLabel=node('label','','Public message (optional)');noteLabel.htmlFor='gift-message';const note=node('textarea');note.id='gift-message';note.maxLength=240;form.append(noteLabel,note);
    const consentLabel=node('label','gift-consent'),consent=node('input');consent.type='checkbox';consent.id='gift-consent';consent.required=true;
    consentLabel.append(consent,node('span','','My recipient agrees that this public name, handle and message will appear in the gift wall, profile and leaderboards.'));form.append(consentLabel);
    const publish=node('button','linkbutton','Publish this public gift');publish.type='submit';publish.disabled=!creationEnabled;form.append(publish);
    const status=node('p');status.id='gift-publish-status';status.setAttribute('role','status');form.append(status);workspace.append(form);
    if(!creationEnabled)status.textContent='New public gifting is closed. You can still recover or remove your existing public gifts.';
    form.addEventListener('input',()=>{publicationRequestId=null;});
    form.addEventListener('change',()=>{publicationRequestId=null;});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!creationEnabled||!form.reportValidity()||!consent.checked)return;
      const epoch=accessEpoch,key=purchaseKey;publicationRequestId=publicationRequestId||crypto.randomUUID();publish.disabled=true;status.textContent='Publishing your public gift…';
      try{
        const body={productSku:select.value,recipientHandle:handle.value.trim().toLowerCase(),name:name.value.trim().normalize('NFC'),text:note.value.trim(),consent:true,requestId:publicationRequestId};
        const data=await request('publish',{method:'POST',body,key});if(epoch!==accessEpoch)return;if(!giftValid(data.gift))throw Error('gift_unavailable');
        ownedGifts.unshift(data.gift);status.replaceChildren(node('span','','Your gift is public. '));const link=node('a','','View '+data.gift.name+'’s gift');link.href=giftUrl(data.gift.id);status.append(link);
        if(!seen.has(data.gift.id)){notify(data.gift);seen.add(data.gift.id);watermark=Math.max(watermark,data.gift.createdAt);}
        publicationRequestId=null;drawOwned();
      }catch(error){if(epoch===accessEpoch)status.textContent=explain(error);}finally{if(epoch===accessEpoch)publish.disabled=!creationEnabled;}
    });
    drawOwned();
  }
  function drawOwned(){
    const workspace=$('gift-workspace');let list=$('own-public-gifts');if(!list){list=node('div','gift-own-list');list.id='own-public-gifts';workspace.append(list);}
    list.replaceChildren(node('h2','','Your public gifts'));
    if(!ownedGifts.length){list.append(node('p','fine','No public gifts from this purchase are listed.'));return;}
    for(const gift of ownedGifts.filter(giftValid)){
      const row=node('div','gift-rank'),link=node('a','gift-rank-title',gift.name+' · '+gift.productName);link.href=giftUrl(gift.id);
      const remove=node('button','text-link','Remove');remove.type='button';remove.addEventListener('click',async()=>{
        const epoch=accessEpoch,key=purchaseKey;remove.disabled=true;try{await request('remove',{method:'POST',body:{id:gift.id},key});if(epoch!==accessEpoch)return;removedLocally(gift.id);poll();}
        catch(error){if(epoch===accessEpoch){remove.disabled=false;$('gift-access-status').textContent=explain(error);}}
      });row.append(link,remove);list.append(row);
    }
  }
  function removedLocally(id){
    ownedGifts=ownedGifts.filter(gift=>gift.id!==id);
    if(purchaseKey&&$('own-public-gifts'))drawOwned();
    for(const toast of stack?.children||[])if(toast.dataset.giftId===id)toast.remove();
  }
  async function refreshAvailability(){
    const epoch=++availabilityEpoch;availabilityKnown=false;creationEnabled=false;$('gift-verify-button').disabled=true;
    try{
      const state=await request('status');if(epoch!==availabilityEpoch||!active)return;
      availabilityKnown=true;publicReadEnabled=state.publicReadEnabled===true;creationEnabled=state.creationEnabled===true;
      $('gift-verify-button').disabled=!publicReadEnabled;
      $('gift-access-status').textContent=creationEnabled?'Verify your purchase key to choose the public details.':'New public gifting is not open yet. Existing keys can recover or remove their public gifts.';
    }catch(error){if(epoch===availabilityEpoch&&active)$('gift-access-status').textContent=explain(error);}
  }
  function creation(){
    refreshAvailability();
    $('gift-key').addEventListener('input',()=>{clearAccess(false);$('gift-access-status').textContent='Verify this purchase key to continue.';});
    $('gift-key-form').addEventListener('submit',async event=>{
      event.preventDefault();if(!availabilityKnown||!publicReadEnabled||!active)return;const key=$('gift-key').value.trim();clearAccess(false);const epoch=accessEpoch;$('gift-verify-button').disabled=true;$('gift-access-status').textContent='Verifying your purchase…';
      try{
        const product=new URLSearchParams(location.search).get('product'),body=bySku.has(product)?{productSku:product}:{};
        const data=await request('access',{method:'POST',body,key});if(epoch!==accessEpoch)return;
        if(!Array.isArray(data.products)||!data.products.length||!Array.isArray(data.gifts))throw Error('gift_unavailable');
        const selected=data.products.map(product=>bySku.get(product.sku));if(selected.some(product=>!product)||new Set(selected.map(p=>p.sku)).size!==selected.length)throw Error('gift_unavailable');
        purchaseKey=key;allowedProducts=selected;ownedGifts=data.gifts.filter(giftValid);$('gift-key').value='';
        $('gift-access-status').textContent='Purchase verified. Only your purchased products are available here.';drawEditor();
      }catch(error){if(epoch===accessEpoch){clearAccess();$('gift-access-status').textContent=explain(error);}}finally{if(epoch===accessEpoch)$('gift-verify-button').disabled=!availabilityKnown||!publicReadEnabled;}
    });
    $('gift-removal-form').addEventListener('submit',async event=>{
      event.preventDefault();const value=$('gift-removal-id').value.trim();let id=value;
      try{if(!/^[a-f0-9]{24}$/.test(id)){const url=new URL(value);if(url.origin!==ROOT||url.pathname!=='/gifts/view/')throw Error();id=url.searchParams.get('id');}if(!/^[a-f0-9]{24}$/.test(id||''))throw Error();}
      catch{$('gift-removal-status').textContent='Use a public gift link or its 24-character ID.';return;}
      try{await request('remove',{method:'POST',body:{id},key:$('gift-removal-key').value.trim()});removedLocally(id);$('gift-removal-key').value='';$('gift-removal-status').textContent='Public gift removed. Its collection and popularity scores will update.';poll();}
      catch(error){$('gift-removal-status').textContent=explain(error);}
    });
  }
  if(page==='profile')loadProfile();if(page==='view')loadGift();if(page==='create')creation();
})();
