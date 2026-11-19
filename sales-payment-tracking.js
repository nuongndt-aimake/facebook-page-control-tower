document.addEventListener('sales-order-created',event=>{
  const {order,order_status_token:token}=event.detail;if(!order?.id||!token)return;
  const box=document.createElement('p');box.setAttribute('role','status');box.style.cssText='padding:12px;color:#172554;background:#eff6ff;border-radius:8px';
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
        if(data.payment_status==='paid'&&data.gift?.download_url){const url=new URL(data.gift.download_url);if(url.protocol==='https:'){const link=document.createElement('a');link.textContent='Tải '+data.gift.name;link.href=url.href;link.target='_blank';link.rel='noopener';link.style.display='block';box.append(link)}}
      }
    }catch{box.textContent='Chưa đọc được trạng thái thanh toán. Hệ thống sẽ thử lại.'}
    if(!stopped)timer=setTimeout(poll,5000);
  };
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer)},{once:true});poll();
},{once:true});
