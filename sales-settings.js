(async()=>{
  const client=window.__authNavClient||supabase.createClient('https://tlcjcqqnfjrqsoiaalfk.supabase.co','sb_publishable_Q05ypFa4Ele00vyzy5X9Rw_tBWEJuvr');
  const session=(await client.auth.getSession()).data.session;if(!session)return;
  const request=async(body)=>{const response=await fetch('/api/admin/sales-orders',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Không thể lưu cấu hình');return result};
  try{
    const data=await request();if(!Array.isArray(data.settings))return;
    const panel=document.createElement('section');panel.className='card';panel.innerHTML='<h2>Cấu hình bán Fanpage</h2><form id="sales-settings-form"><p><label>Video hướng dẫn lấy liên kết hồ sơ<br><input name="video" type="url" class="input" placeholder="https://..." style="width:100%"></label></p><button class="btn2" type="submit">Lưu video</button></form><hr><form id="sales-price-form"><p><label>Sản phẩm <select name="product" class="input"></select></label></p><p><label>Giá bán (đồng) <input name="amount" type="number" min="0" step="1" required class="input"></label></p><p><label>Hiệu lực từ <input name="effective" type="datetime-local" required class="input"></label></p><button class="btn2" type="submit">Lưu giá theo thời điểm</button></form><p role="status" id="settings-status"></p>';
    document.querySelector('main').append(panel);
    const video=panel.querySelector('[name=video]');video.value=data.settings.find(x=>x.setting_key==='profile_link_help_video')?.setting_value?.url||'';
    const product=panel.querySelector('[name=product]');for(const item of data.products||[]){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;product.append(option)}
    const status=panel.querySelector('#settings-status');
    const save=async(form,body)=>{const button=form.querySelector('button');button.disabled=true;try{await request(body);status.textContent='Đã lưu. Trang mua hàng sẽ sử dụng cấu hình theo thời điểm hiệu lực.'}catch(error){status.textContent=error.message}finally{button.disabled=false}};
    panel.querySelector('#sales-settings-form').onsubmit=event=>{event.preventDefault();save(event.target,{action:'save_sales_setting',setting_key:'profile_link_help_video',url:video.value})};
    panel.querySelector('#sales-price-form').onsubmit=event=>{event.preventDefault();const form=event.target;save(form,{action:'set_product_price',product_id:product.value,unit_price_vnd:Number(form.elements.amount.value),effective_from:new Date(form.elements.effective.value).toISOString()})};
  }catch(error){console.error('Không thể đọc cấu hình bán hàng',error)}
})();
