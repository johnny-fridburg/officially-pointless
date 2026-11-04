'use strict';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function activityHtml(department){
  switch(department.activity){
    case 'silence': return '<p class="timer" id="timer" role="status" aria-live="off">60</p><button id="ceremony" type="button">Begin a minute of silence</button><p id="outcome" role="status"></p>';
    case 'loading': return '<progress id="progress" max="5" value="0" aria-label="Five-second ceremony"></progress><p><button id="ceremony" type="button">Sponsor a brief delay</button></p><p id="outcome" role="status"></p>';
    case 'button': return '<button id="ceremony" type="button">Accomplish nothing</button><p id="outcome" role="status"></p>';
    case 'ribbon': return '<div class="ribbon" aria-hidden="true"></div><button id="ceremony" type="button">Open the entirely optional occasion</button><p id="outcome" role="status"></p>';
    case 'error': return '<p class="error-number">404</p><p>Recognition not found. This document has been supplied instead.</p>';
    case 'wing': return '<div class="empty-frame" aria-label="An intentionally empty gallery"></div><p>No exhibits were required.</p>';
    case 'monument': return '<div class="empty-frame" aria-label="The monument is intentionally invisible"></div><p>The absence is intentional.</p>';
    case 'museum': return '<p class="museum-label">A tiny guided tour begins here.</p>';
    case 'debate': return '<p>Defend the indefensible: explain why this choice belongs in a museum.</p>';
    default: return '<p>Read the final statement aloud. Take a ceremonially conclusive bow.</p>';
  }
}
function ceremonyScript(activity){
  // The script has only fixed catalog values. Personalization never enters JS.
  if(!['silence','loading','button','ribbon'].includes(activity))return '';
  const duration=activity==='silence'?60:activity==='loading'?5:0;
  return `<script>(()=>{const button=document.getElementById('ceremony'),outcome=document.getElementById('outcome'),timer=document.getElementById('timer'),progress=document.getElementById('progress');let interval;button.addEventListener('click',()=>{clearInterval(interval);const duration=${duration};if(!duration){outcome.textContent=${activity==='button'?'"Nothing useful happened. Impeccably."':'"The occasion is now officially open. No particular reason was required."'};return;}const started=performance.now();button.disabled=true;outcome.textContent='Ceremony in progress.';function tick(){const elapsed=(performance.now()-started)/1000,remaining=Math.max(0,Math.ceil(duration-elapsed));if(timer)timer.textContent=String(remaining);if(progress)progress.value=Math.min(duration,elapsed);if(!remaining){clearInterval(interval);button.disabled=false;outcome.textContent='The ceremony is complete. Replay whenever you wish.';}}tick();interval=setInterval(tick,200);});window.addEventListener('pagehide',()=>clearInterval(interval));window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(interval);button.disabled=false;if(timer)timer.textContent=String(${duration});if(progress)progress.value=0;outcome.textContent='Replay the ceremony whenever you wish.';}});})();</script>`;
}
function renderGift(department,input){
  const theme=department.slug==='make-it-worse'?input.theme:'classic';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(department.name)} — A gift for ${escape(input.name)}</title>
<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#e8e7d9;color:#19362f;font:17px/1.6 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:45px;background:#f6f0e4;border:double 5px #19362f;overflow-wrap:anywhere}h1,h2{font-family:Georgia,serif;line-height:1.15}h1{font-size:clamp(34px,5vw,54px)}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase}.dedication{font:28px/1.5 Georgia,serif;white-space:pre-wrap;margin:35px 0}.timer{font-size:70px;margin:18px 0}.error-number{font-size:100px;color:#a78845;margin:0}.empty-frame{height:160px;max-width:340px;margin:24px auto;border:1px solid #19362f}.ribbon{height:30px;background:#a44836;margin:28px 0}progress{width:100%;height:35px}button{font:inherit;padding:12px 18px;cursor:pointer;color:#f6f0e4;background:#19362f;border:1px solid #19362f}.activity{padding:24px 0;border-top:1px solid #c8ccbd}.fine{font-size:12px}.chaos{background:#f4d673;color:#5f155c;border-color:#b82d24}.terminal{background:#12251a;color:#c4efcb;border-color:#75a87b}@page{size:A4;margin:14mm}@media print{body{padding:0;background:white}main{max-width:none;padding:12mm}button,progress,.timer,#outcome,.ribbon{display:none}.dedication{font-size:22px}h1{font-size:34px}.activity{break-inside:avoid}}@media(max-width:500px){body{padding:12px}main{padding:24px}}</style></head>
<body><main class="${theme}"><p class="eyebrow">Officially Pointless · Fictional ceremony</p><h1>${escape(department.name)}</h1><p>${escape(department.artifact)}</p><h2>Presented to ${escape(input.name)}</h2>${input.title?'<h3>'+escape(input.title)+'</h3>':''}<p class="dedication">${escape(input.text)}</p>${input.giver?'<p>With affection from '+escape(input.giver)+'</p>':''}<section class="activity"><h2>Your entirely optional ceremony</h2><p>${escape(department.private)}</p>${activityHtml(department)}</section><p class="fine">Private gift. Names and dedication remain in this file; nothing is published. Print using your browser, or save as PDF. No physical item, legal authority or real ownership is conferred. Personal use and gifts only; no resale.</p></main>${ceremonyScript(department.activity)}</body></html>`;
}
module.exports={renderGift,escape};
