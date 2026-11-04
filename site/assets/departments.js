/* Public sample redemption shell. Creation controls are mounted only after the
   server verifies payment; private gift/activity HTML comes from the paid API. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const messages={paid_access_not_open:'Purchases and department access are not open yet.',payment_required:'A valid paid department collection purchase is required. Gift-kit, refunded and test purchases do not grant access.',payment_unavailable:'Purchase verification is temporarily unavailable. Please try again.',invalid_submission:'Check the name, dedication and other fields, then try again.',not_your_entry:'This key did not publish that page.',record_not_found:'This public page was removed or could not be found.',department_already_used:'Your purchase already has a public page in this department. Remove that page before publishing a replacement.',retry_changed:'This retry changed the dedication. Please try again.',record_removed:'That earlier publication was removed. Change the dedication before publishing a new page.',publication_limit:'Please wait a little before publishing another dedication.',department_full:'This department has reached its current capacity. Contact support before purchasing access.',department_busy:'The department is busy. Try again shortly.',department_unavailable:'The department is temporarily unavailable.'};
  let license=null,createdId=null,requestId=null,fingerprint=null,busy=false;
  async function request(action,body,key){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const options={signal:controller.signal,cache:'no-store',credentials:'omit'};
      if(body!==undefined){options.method='POST';options.headers={'Content-Type':'application/json','X-Pointless-License':key||''};options.body=JSON.stringify(body);}
      const response=await fetch('/api/departments/'+action,options);
      let data;try{data=await response.json();}catch{throw Error(messages.department_unavailable);}
      if(!response.ok){const e=Error(messages[data.error]||messages.department_unavailable);e.code=data.error;throw e;}
      return data;
    }finally{clearTimeout(timeout);}
  }
  function text(tag,value,parent,attrs={}){
    const element=document.createElement(tag);element.textContent=value;
    for(const [key,val]of Object.entries(attrs))element.setAttribute(key,val);
    parent.append(element);return element;
  }
  function forget(){license=null;createdId=null;requestId=null;fingerprint=null;const workspace=byId('department-workspace');workspace.replaceChildren();workspace.hidden=true;byId('redeem-form').hidden=false;byId('purchase-key').value='';}
  function failed(error,status){status.textContent=error.message||messages.department_unavailable;if(error.code==='payment_required'){forget();byId('access-status').textContent=error.message;}}
  function mountWorkspace(catalog,records=[]){
    if(!Array.isArray(catalog)||catalog.length!==10||catalog.some(d=>!d||typeof d.name!=='string'||typeof d.slug!=='string'||!/^[a-z-]+$/.test(d.slug)))throw Error(messages.department_unavailable);
    const workspace=byId('department-workspace');
    // Fixed authored markup only. Catalog and visitor text use DOM text values.
    workspace.innerHTML=`<form id="creation-form" class="department-form"><label for="department">Department</label><select id="department"></select><label for="output-mode">Output</label><select id="output-mode"><option value="private">Private gift / activity</option><option value="public">Public presence</option></select><label id="name-label" for="recipient">Recipient name</label><input id="recipient" maxlength="70" required autocomplete="off"><div id="giver-field"><label for="giver">Given by</label><input id="giver" maxlength="70" autocomplete="off"></div><label for="dedication">Dedication</label><textarea id="dedication" maxlength="240" required></textarea><label for="ceremonial-title">Exhibit or ceremonial title</label><input id="ceremonial-title" maxlength="70" autocomplete="off"><div id="theme-field" hidden><label for="theme">Presentation</label><select id="theme"><option value="classic">Classic</option><option value="chaos">Questionable taste</option><option value="terminal">Terminal</option></select></div><div id="public-consent-field" hidden><p>Only your alias, title and dedication will be public. Each purchase permits one active page per department. Removing it permits a replacement.</p><label for="public-consent"><input id="public-consent" type="checkbox"> I want this alias, title and dedication to be public.</label></div><button id="create-output" class="linkbutton" type="submit">Download private gift</button><button id="forget-key" type="button">Forget purchase key</button><p id="creation-status" class="department-action-status" role="status" aria-live="polite"></p><a id="created-link" class="department-action-link" hidden></a><button id="remove-created" type="button" hidden>Remove this public page</button></form>`;
    for(const d of catalog){const option=document.createElement('option');option.value=d.slug;option.textContent=d.name;byId('department').append(option);}
    const form=byId('creation-form'),status=byId('creation-status');
    function update(){
      const publicMode=byId('output-mode').value==='public';
      byId('name-label').textContent=publicMode?'Public alias':'Recipient name';byId('giver-field').hidden=publicMode;byId('public-consent-field').hidden=!publicMode;byId('public-consent').required=publicMode;byId('create-output').textContent=publicMode?'Publish my public page':'Download private gift';byId('theme-field').hidden=byId('department').value!=='make-it-worse';
    }
    byId('output-mode').addEventListener('change',()=>{byId('recipient').value='';byId('public-consent').checked=false;update();});byId('department').addEventListener('change',update);update();
    byId('forget-key').addEventListener('click',()=>{if(!busy)forget();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!license||!form.reportValidity())return;
      const publicMode=byId('output-mode').value==='public';
      if(publicMode&&!byId('public-consent').checked)return;
      const input={department:byId('department').value,name:byId('recipient').value,giver:publicMode?'':byId('giver').value,text:byId('dedication').value,title:byId('ceremonial-title').value,theme:byId('theme').value};
      const current=JSON.stringify(input);if(current!==fingerprint){fingerprint=current;requestId=crypto.randomUUID();}
      input.requestId=requestId;busy=true;byId('create-output').disabled=true;status.textContent=publicMode?'Verifying purchase and publishing your page…':'Verifying purchase and preparing your private gift…';
      try{
        const data=await request(publicMode?'publish':'gift',input,license);
        if(publicMode){
          if(!data.record||!/^[a-f0-9]{24}$/.test(data.record.id))throw Error(messages.department_unavailable);
          createdId=data.record.id;const link=byId('created-link');link.href='/presence/?id='+createdId;link.textContent='View your public page';link.hidden=false;byId('remove-created').hidden=false;status.textContent='Published. Only your chosen public fields are on the page.';
        }else{
          if(typeof data.html!=='string'||!/^[a-z-]+-gift\.html$/.test(data.filename))throw Error(messages.department_unavailable);
          const url=URL.createObjectURL(new Blob([data.html],{type:'text/html;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=data.filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Your private gift is ready. Open the downloaded HTML file to print or use its offline activity. Nothing was published.';
        }
      }catch(e){failed(e,status);}finally{busy=false;if(byId('create-output'))byId('create-output').disabled=false;}
    });
    byId('remove-created').addEventListener('click',async()=>{
      if(busy||!createdId||!license)return;busy=true;byId('remove-created').disabled=true;
      try{await request('remove',{id:createdId},license);createdId=null;requestId=null;fingerprint=null;byId('created-link').hidden=true;byId('remove-created').hidden=true;status.textContent='Your public page was removed. You can publish a replacement.';}
      catch(e){failed(e,status);}finally{busy=false;if(byId('remove-created'))byId('remove-created').disabled=false;}
    });
    if(Array.isArray(records)&&records.length){
      const owned=document.createElement('section');owned.id='owned-pages';text('h2','Your active public pages',owned);
      text('p','These links belong to your verified purchase. Remove a page before publishing its replacement.',owned);
      for(const record of records){
        if(!record||!/^[a-f0-9]{24}$/.test(record.id))continue;
        const d=catalog.find(d=>d.slug===record.department);if(!d)continue;
        const row=document.createElement('p');text('a',d.name+' — '+record.name,row,{href:'/presence/?id='+record.id});
        const button=text('button','Remove '+d.name,row,{type:'button'});
        button.addEventListener('click',async()=>{
          if(busy||!license)return;busy=true;button.disabled=true;
          try{await request('remove',{id:record.id},license);row.remove();fingerprint=null;requestId=null;status.textContent='Your public page was removed. You can publish a replacement.';}
          catch(e){failed(e,status);}finally{busy=false;button.disabled=false;}
        });owned.append(row);
      }workspace.append(owned);
    }
    workspace.hidden=false;byId('redeem-form').hidden=true;byId('access-status').textContent='Purchase verified for this tab. Choose a private gift or an explicit public dedication.';
  }
  async function accessPage(){
    const status=byId('access-status');
    try{const state=await request('status');if(state.enabled!==true)return;byId('redeem-form').hidden=false;byId('removal-form').hidden=false;status.textContent='Verify your department collection purchase to begin.';}
    catch{status.textContent=messages.department_unavailable;return;}
    byId('redeem-form').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;busy=true;const button=event.currentTarget.querySelector('button');button.disabled=true;status.textContent='Verifying your purchase…';
      const key=byId('purchase-key').value;
      try{const data=await request('access',{},key);mountWorkspace(data.departments,data.records);license=key;byId('purchase-key').value='';}
      catch(e){status.textContent=e.message||messages.department_unavailable;}
      finally{busy=false;button.disabled=false;}
    });
    byId('removal-form').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const status=byId('removal-status'),key=byId('removal-key').value,raw=byId('removal-id').value.trim();let id=raw;
      if(!/^[a-f0-9]{24}$/.test(id)){try{const url=new URL(raw,location.origin);if(![location.origin,'https://officiallypointless.com','https://www.officiallypointless.com'].includes(url.origin)||url.pathname!=='/presence/')throw Error();id=url.searchParams.get('id');}catch{id='';}}
      if(!/^[a-f0-9]{24}$/.test(id||'')){status.textContent='Enter the public page link or its 24-character ID.';return;}
      busy=true;const button=event.currentTarget.querySelector('button');button.disabled=true;
      try{await request('remove',{id},key);byId('removal-key').value='';status.textContent='The public page was removed.';}
      catch(e){status.textContent=e.message||messages.department_unavailable;}
      finally{busy=false;button.disabled=false;}
    });
  }
  function replay(activity,parent){
    if(!['silence','loading','button','ribbon'].includes(activity))return;
    let interval;
    const duration=activity==='silence'?60:activity==='loading'?5:0;
    const display=text('p',duration?String(duration):'',parent,{class:'timer','aria-live':'off'});
    const button=text('button',{silence:'Observe a minute of silence',loading:'Replay the sponsored delay',button:'Accomplish nothing',ribbon:'Open the optional occasion'}[activity],parent,{type:'button'});
    const outcome=text('p','',parent,{role:'status'});
    button.addEventListener('click',()=>{
      clearInterval(interval);if(!duration){outcome.textContent=activity==='button'?'Nothing useful happened. Impeccably.':'The occasion is open. No reason was required.';return;}
      button.disabled=true;const start=performance.now();outcome.textContent='Ceremony in progress.';
      function tick(){const left=Math.max(0,Math.ceil(duration-(performance.now()-start)/1000));display.textContent=String(left);if(!left){clearInterval(interval);button.disabled=false;outcome.textContent='The ceremony is complete.';}}
      tick();interval=setInterval(tick,200);
    });
    window.addEventListener('pagehide',()=>clearInterval(interval));
    window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(interval);button.disabled=false;display.textContent=duration?String(duration):'';outcome.textContent='Replay the ceremony whenever you wish.';}});
  }
  async function presencePage(){
    const status=byId('presence-status'),id=new URLSearchParams(location.search).get('id');
    if(!/^[a-f0-9]{24}$/.test(id||'')){status.textContent='This public link is incomplete. Ask the sender for the full link.';return;}
    try{
      const data=await request('presence?id='+id),r=data.record;
      if(!r||!r.name||!r.text||!/^[a-z-]+$/.test(r.department))throw Error(messages.department_unavailable);
      // Catalog names are public product copy, never inferred from a visitor's text.
      const names={'make-it-worse':['Bad Taste Department','debate'],silence:['A Minute of Silence','silence'],loading:['The Sponsored Loading Bar','loading'],'last-word':['The Last Word','statement'],museum:['The Ordinary Museum','museum'],'golden-error':['A Gold-Plated Error','error'],button:['The Over-Sponsored Button','button'],'empty-wing':['The Empty Wing','wing'],'unnecessary-ribbon':['The Unnecessary Ribbon','ribbon'],'invisible-monument':['The Invisible Monument','monument']};
      const entry=names[r.department];if(!entry)throw Error(messages.department_unavailable);
      byId('presence-heading').textContent=entry[0];document.title=entry[0]+' — Officially Pointless';
      const parent=byId('presence-result'),theme=r.department==='make-it-worse'&&['chaos','terminal'].includes(r.theme)?r.theme:'classic';
      parent.className='presence-art '+theme;text('p','Dedicated by',parent,{class:'eyebrow'});text('h2',r.name,parent,{id:'public-name'});if(r.title)text('h3',r.title,parent,{id:'public-title'});text('blockquote',r.text,parent);
      if(entry[1]==='error')text('p','404',parent,{class:'timer'});
      if(['wing','monument'].includes(entry[1]))text('p',entry[1]==='wing'?'No exhibits were required.':'The absence is intentional.',parent);
      replay(entry[1],parent);parent.hidden=false;status.textContent='A purchased public dedication. The alias and wording were chosen by its publisher.';
      const link=byId('presence-department-link');link.href='/departments/'+r.department+'/';link.textContent='Explore '+entry[0];
    }catch(e){status.textContent=e.message||messages.department_unavailable;}
  }
  if(byId('access-status'))accessPage();if(byId('presence-status'))presencePage();
  window.addEventListener('pagehide',()=>{license=null;for(const id of ['purchase-key','removal-key'])if(byId(id))byId(id).value='';});
  window.addEventListener('pageshow',event=>{if(event.persisted&&byId('access-status')){forget();byId('access-status').textContent='Verify your purchase again to continue in this tab.';}});
})();
