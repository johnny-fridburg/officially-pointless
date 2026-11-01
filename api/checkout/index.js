'use strict';
// Closed deliberately: redirects/client claims must never become proof of purchase.
// Replace only after separate-product acceptance and a verified server-side lifecycle.
module.exports=async function(context){context.res={status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:{error:'checkout_not_open',message:'No purchase is available. You have not been charged.'}};};
