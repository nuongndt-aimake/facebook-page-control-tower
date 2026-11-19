document.addEventListener('sales-order-created',event=>{
  const {order,order_status_token:token}=event.detail;if(!order?.id||!token)return;
  const box=document.createElement('section');box.setAttribute('role','status');box.style.cssText='padding:18px;color:#172554;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px';
  document.querySelector('.payment-card').append(box);
  let stopped=false,timer;
  const poll=async()=>{
    if(stopped)return;
    try{
      const response=await fetch('/api/admin/access?endpoint=public-order-status&order_id='+encodeURIComponent(order.id),{headers:{'x-order-token':token},cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Không thể đọc trạng thái');const data=await response.json();
      const labels={pending_payment:'Đang chờ thanh toán',paid:'Thanh toán thành công',reconciliation_required:'Cần đối soát thanh toán',expired:'Đã hết thời hạn thanh toán',cancelled:'Đơn đã hủy',refunded:'Đơn đã hoàn tiền'};
      box.textContent=order.amount_vnd===0&&data.payment_status!=='paid'?'Đơn 0 đồng đang chờ nhân viên xác minh':labels[data.payment_status]||'Đang kiểm tra thanh toán';
      if(['paid','cancelled','refunded','expired'].includes(data.payment_status)){
        stopped=true;document.querySelector('#qr').classList.add('hidden');document.querySelector('#download-qr').classList.add('hidden');document.querySelector('#timer').classList.add('hidden');
        if(data.payment_status==='paid'){
          const heading=document.createElement('h2');heading.textContent='Thanh toán thành công';box.replaceChildren(heading);const reference=document.createElement('p');reference.textContent='Mã đơn: '+data.order_code;box.append(reference);
          const copy=document.createElement('button');copy.type='button';copy.textContent='Sao chép mã đơn';copy.dataset.copy=data.order_code;copy.className='copy';box.append(copy);
          if(data.gift?.download_url){const url=new URL(data.gift.download_url);if(url.protocol==='https:'){const link=document.createElement('a');link.textContent='⇩ Tải '+(data.gift.name||'quà tặng');link.href=url.href;link.target='_blank';link.rel='noopener';link.style.cssText='display:block;padding:14px 0;font-weight:800';box.append(link)}}
          const support=data.support||{},phone=String(support.phone||'');if(phone){const link=document.createElement('a');link.textContent='Điện thoại hỗ trợ: '+phone;link.href='tel:'+phone.replace(/[^+0-9]/g,'');link.style.display='block';box.append(link)}
          const zalo=support.zalo_url||(/^[+0-9 .()-]{8,30}$/.test(phone)?'https://zalo.me/'+phone.replace(/\D/g,''):'');if(/^https:\/\/(www\.)?zalo\.me\//i.test(zalo)){const link=document.createElement('a');link.textContent='Nhắn Zalo hỗ trợ · gửi kèm mã đơn';link.href=zalo;link.target='_blank';link.rel='noopener noreferrer';link.style.cssText='display:block;padding:12px 0;font-weight:800';box.append(link)}
        }
      }
    }catch{box.textContent='Chưa đọc được trạng thái thanh toán. Hệ thống sẽ thử lại.'}
    if(!stopped)timer=setTimeout(poll,5000);
  };
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer)},{once:true});poll();
},{once:true});
