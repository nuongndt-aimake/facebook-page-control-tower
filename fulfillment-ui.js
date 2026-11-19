(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,body){const client=window.__authNavClient||supabase.createClient('https://tlcjcqqnfjrqsoiaalfk.supabase.co','sb_publishable_Q05ypFa4Ele00vyzy5X9Rw_tBWEJuvr'),session=(await client.auth.getSession()).data.session;if(!session)throw Error('Vui lòng đăng nhập');const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'Không thể thực hiện');return data}
 const style=document.createElement('style');style.textContent='.fulfillment-dialog{width:min(960px,calc(100vw - 24px));max-height:88dvh;overflow:auto;background:#151c20;color:#fff;border:1px solid #53636b;border-radius:12px;padding:20px}.fulfillment-dialog::backdrop{background:#000a}.fulfillment-dialog label{display:block;margin:10px 0}.fulfillment-dialog input[type=checkbox]{width:18px;height:18px;vertical-align:middle}.fulfillment-dialog .input{max-width:100%;width:100%;min-height:42px}.fulfillment-dialog button{min-height:42px;margin:4px}.stock-choices{max-height:36vh;overflow:auto;border:1px solid #425054;padding:12px}.stock-choice{overflow-wrap:anywhere}.fulfillment-actions{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:680px){.fulfillment-actions button{width:100%}.fulfillment-dialog{padding:14px}}';document.head.append(style);
 let dialog;
 window.openSalesFulfillment=async orderId=>{
  if(!dialog){dialog=document.createElement('dialog');dialog.className='fulfillment-dialog';document.body.append(dialog)}
  dialog.innerHTML='<form method="dialog"><button class="btn2">Đóng</button></form><p>Đang tải đơn và kho…</p>';if(!dialog.open)dialog.showModal();
  try{
   const data=await api('/api/admin/access?endpoint=sales_fulfillment&order_id='+encodeURIComponent(orderId));const order=data.order,can=scope=>data.permissions.includes(scope),details=new Map(data.details.map(row=>[row.inventory_item_id,row]));
   dialog.innerHTML='<form method="dialog"><button class="btn2">Đóng</button></form><h2>Kho & bàn giao · '+esc(order.order_code)+'</h2><p>'+esc(order.payment_status)+' · '+order.quantity+' Page · '+esc(order.fulfillment_status)+'</p>'+
    '<label>Đích bàn giao<select id="fulfillment-destination" class="input"><option value="external">Bán ngoài</option><option value="inhouse" '+(Number(order.expected_amount_vnd)!==0?'disabled':'')+'>Kho Inhouse — đơn 0 đồng</option></select></label><div class="stock-choices">'+(data.items.length?data.items.map(item=>{const detail=details.get(item.id)||{},reserved=item.status==='reserved';return '<label class="stock-choice"><input type="checkbox" data-stock-id="'+esc(item.id)+'" '+(reserved?'checked disabled':'')+'> '+esc(item.inventory_code)+' · '+esc(detail.page_name||detail.facebook_page_id)+' · '+esc(item.status)+'</label>'}).join(''):'Không có mã kho khả dụng cho sản phẩm này.')+'</div>'+
    '<label>Lý do / ghi chú<textarea id="fulfillment-reason" class="input" rows="2"></textarea></label><div class="fulfillment-actions">'+
    (can('reserve')&&order.fulfillment_status!=='completed'?'<button class="btn2 primary" data-flow="reserve">Giữ các mã đã chọn</button>':'')+
    (can('release')?'<button class="btn2" data-flow="release_order">Trả các mã đang giữ</button>':'')+
    (can('finalize')&&Number(order.expected_amount_vnd)===0&&order.zero_value_verification_status!=='verified'?'<button class="btn2" data-flow="verify_zero">Xác minh đơn 0 đồng</button>':'')+
    (can('finalize')&&order.fulfillment_status!=='completed'?'<button class="btn2 primary" data-flow="finalize">Xác nhận bàn giao / chuyển kho</button>':'')+'</div><p id="flow-message" role="status"></p><h3>Mã gắn với đơn</h3><ul>'+data.order_items.map(item=>'<li>'+esc(item.inventory_code)+' · '+esc(item.page_name)+' · '+esc(item.status)+'</li>').join('')+'</ul>'+
    (data.manage?'<hr><h3>Người phụ trách đơn</h3><select id="order-assignee" class="input">'+data.users.map(user=>'<option value="'+esc(user.id)+'">'+esc(user.display_name||user.id)+' · '+esc(user.role)+'</option>').join('')+'</select><button class="btn2" id="save-order-assignee">Giao xử lý đơn</button>':'');
   dialog.querySelector('#fulfillment-destination').value=order.fulfillment_destination||'external';
   for(const button of dialog.querySelectorAll('[data-flow]'))button.onclick=async()=>{
    const action=button.dataset.flow,reason=dialog.querySelector('#fulfillment-reason').value.trim();
    if(action==='release_order'&&!reason){dialog.querySelector('#flow-message').textContent='Vui lòng nhập lý do trả mã';return}
    if(action==='finalize'&&!confirm('Xác nhận đã kiểm tra thanh toán và bàn giao? Mã kho sẽ rời kho tổng.'))return;
    const ids=[...dialog.querySelectorAll('[data-stock-id]:checked')].map(input=>input.dataset.stockId);
    for(const other of dialog.querySelectorAll('[data-flow]'))other.disabled=true;
    try{await api('/api/admin/access?endpoint=sales_fulfillment',{action,order_id:orderId,inventory_item_ids:ids,destination:dialog.querySelector('#fulfillment-destination').value,reason});await window.openSalesFulfillment(orderId);document.dispatchEvent(new Event('sales-fulfillment-changed'))}catch(error){dialog.querySelector('#flow-message').textContent=error.message;for(const other of dialog.querySelectorAll('[data-flow]'))other.disabled=false}
   };
   const assign=dialog.querySelector('#save-order-assignee');if(assign)assign.onclick=async()=>{assign.disabled=true;try{await api('/api/admin/sales-orders',{action:'assign_order',order_id:orderId,assignee_user_id:dialog.querySelector('#order-assignee').value,handover_note:dialog.querySelector('#fulfillment-reason').value});dialog.querySelector('#flow-message').textContent='Đã giao người phụ trách đơn'}catch(error){dialog.querySelector('#flow-message').textContent=error.message}finally{assign.disabled=false}};
  }catch(error){dialog.innerHTML='<form method="dialog"><button class="btn2">Đóng</button></form><p role="status">'+esc(error.message)+'</p>'}
 };
 document.addEventListener('click',event=>{const id=event.target.dataset?.fulfillment;if(id)window.openSalesFulfillment(id)});
 document.addEventListener('sales-fulfillment-changed',()=>{const reload=document.querySelector('#reload');if(reload)reload.click()});
})();
