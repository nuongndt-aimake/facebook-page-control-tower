import test from 'node:test';import assert from 'node:assert/strict';import handler from './api/admin/access.mjs';
test('server quote tiers, promo after bulk, checkout snapshot and restricted tracking',async()=>{
  const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://checkout-unit.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SALES_PUBLIC_CHECKOUT_ENABLED:'true'});
  const writes=[];
  global.fetch=async(url,opt={})=>{const u=new URL(url),table=u.pathname.split('/').pop();let result=[];
    if(opt.method==='POST'){const row=JSON.parse(opt.body);writes.push({table,row});assert.equal(table,'sales_checkout_create');result={id:'test-order',...row.p_order}}
    else if(table==='sales_products')result=[{id:'product',sku:'FANPAGE',status:'active',product_type:'fanpage',unit_price_vnd:1500000}];
    else if(table==='sales_product_prices'){assert.ok(u.searchParams.get('effective_from').startsWith('lte.'));assert.equal(u.searchParams.get('order'),'effective_from.desc');result=[{unit_price_vnd:1500000,effective_from:'2026-01-01T00:00:00Z'}]}
    else if(table==='sales_discount_tiers'){const q=Number(u.searchParams.get('min_quantity')?.slice(4));result=[{discount_percent:q>=10?15:q>=5?10:q>=2?5:0}]}
    else if(table==='sales_promo_codes')result=u.searchParams.get('code')==='eq.REF'?[{code:'REF',code_type:'student_referral',discount_type:'percent',discount_value:99,gift_name:'Quà học viên',gift_download_url:'https://example.com/private-gift'}]:[{code:'QA',code_type:'promotion',discount_type:'fixed',discount_value:100000}];
    else if(table==='sales_inventory_items')result=Array.from({length:Number(u.searchParams.get('limit')||1)},(_,id)=>({id}));
    else if(table==='sales_orders')result=[{id:'test-order',order_code:'FS1234567890',payment_status:'pending_payment',expected_amount_vnd:2850000,gift_download_url:'https://example.com/private-gift'}];
    else throw Error('Unexpected call '+url);
    return new Response(JSON.stringify(result),{status:200});};
  const call=async(body,endpoint='public-checkout',headers={})=>{let status,payload;await handler({url:'/?endpoint='+endpoint,method:endpoint.startsWith('public-order-status')?'GET':'POST',headers,body},{setHeader(){},status(n){status=n;return this},json(x){payload=x}});return {status,payload}};
  try{
    for(const [quantity,amount] of [[1,1500000],[2,2850000],[5,6750000],[10,12750000]]){const q=await call({quote_only:true,quantity});assert.equal(q.status,200);assert.equal(q.payload.quote.amount_vnd,amount)}
    const promo=await call({quote_only:true,quantity:2,promo_code:'QA'});assert.equal(promo.payload.quote.amount_vnd,2750000);assert.equal(writes.length,0);
    const combined=await call({quote_only:true,quantity:2,promo_code:'QA',referral_code:'REF'});assert.equal(combined.payload.quote.amount_vnd,2750000);assert.equal(combined.payload.quote.referral_gift_name,'Quà học viên');assert.equal(combined.payload.quote.gift_download_url,undefined);
    assert.equal((await call({quote_only:true,quantity:1,promo_code:'REF'})).status,400);assert.equal((await call({quote_only:true,quantity:1,promo_code:'INHOUSE'})).status,403);
    const created=await call({quantity:2,buyer_name:'QA TEST',buyer_email:'qa@example.com',buyer_phone:'0000000000',fulfillment_profile_url:'https://facebook.com/qa-test'});
    assert.equal(created.status,201);assert.equal(created.payload.order.amount_vnd,2850000);assert.ok(created.payload.qr_url.includes('amount=2850000'));assert.ok(created.payload.qr_url.includes(created.payload.order.payment_reference));assert.equal(writes[0].row.p_order.discount_amount_vnd,150000);assert.equal(writes.length,1);assert.equal(writes[0].row.p_invoice.requested,false);assert.equal(created.payload.order.gift,null);
    assert.equal((await call({},'public-order-status&order_id=test-order',{'x-order-token':'forged'})).status,403);
    const tracked=await call({},'public-order-status&order_id=test-order',{'x-order-token':created.payload.order_status_token});assert.equal(tracked.status,200);assert.equal(tracked.payload.payment_status,'pending_payment');assert.equal(tracked.payload.gift,undefined);assert.equal(tracked.payload.buyer_email,undefined);
  }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
