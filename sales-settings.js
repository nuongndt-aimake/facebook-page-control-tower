(async()=>{
  const client=window.__authNavClient||supabase.createClient('https://tlcjcqqnfjrqsoiaalfk.supabase.co','sb_publishable_Q05ypFa4Ele00vyzy5X9Rw_tBWEJuvr');
  const session=(await client.auth.getSession()).data.session;if(!session)return;
  const request=async(body)=>{const response=await fetch('/api/admin/sales-orders',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Không thể lưu cấu hình');return result};
  try{
    const profileResponse=await fetch('/api/auth/profile',{headers:{Authorization:'Bearer '+session.access_token}});
    if(!profileResponse.ok)return;
    const profile=await profileResponse.json();if(!['platform_admin','super_admin'].includes(profile.profile?.role))return;
    const data=await request();if(!Array.isArray(data.settings))return;
    const panel=document.createElement('section');panel.className='card';panel.innerHTML='<h2>Cấu hình bán Fanpage</h2><form id="sales-settings-form"><p><label>Video hướng dẫn lấy liên kết hồ sơ<br><input name="video" type="url" class="input" placeholder="https://..." style="width:100%"></label></p><button class="btn2" type="submit">Lưu video</button></form><hr><form id="sales-price-form"><p><label>Sản phẩm <select name="product" class="input"></select></label></p><p><label>Giá bán (đồng) <input name="amount" type="number" min="0" step="1" required class="input"></label></p><p><label>Hiệu lực từ <input name="effective" type="datetime-local" required class="input"></label></p><button class="btn2" type="submit">Lưu giá theo thời điểm</button></form><p role="status" id="settings-status"></p>';
    document.querySelector('main').append(panel);
    const video=panel.querySelector('[name=video]');video.value=data.settings.find(x=>x.setting_key==='profile_link_help_video')?.setting_value?.url||'';
    const product=panel.querySelector('[name=product]');for(const item of data.products||[]){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;product.append(option)}
    const status=panel.querySelector('#settings-status');
    const history=document.createElement('div');panel.append(history);
    const money=value=>new Intl.NumberFormat('vi-VN').format(Number(value))+' đ';
    const renderPrices=()=>{
      history.replaceChildren();
      const item=data.products.find(item=>item.id===product.value);if(!item)return;
      const prices=(data.prices||[]).filter(price=>price.product_id===item.id).sort((a,b)=>new Date(b.effective_from)-new Date(a.effective_from));
      const current=prices.find(price=>new Date(price.effective_from)<=new Date());
      const heading=document.createElement('h3');heading.textContent='Giá đang hiệu lực: '+money(current?.unit_price_vnd??item.unit_price_vnd);history.append(heading);
      const title=document.createElement('p');title.textContent='Lịch sử và lịch giá (giờ Việt Nam)';history.append(title);
      for(const price of prices){const row=document.createElement('p');const future=new Date(price.effective_from)>new Date();row.textContent=money(price.unit_price_vnd)+' · '+new Date(price.effective_from).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · '+(future?'Đã lên lịch':price===current?'Đang hiệu lực':'Lịch sử');history.append(row)}
      if(!prices.length){const empty=document.createElement('p');empty.textContent='Chưa có lịch giá riêng; đang dùng giá niêm yết.';history.append(empty)}
    };
    product.onchange=renderPrices;renderPrices();
    const save=async(form,body)=>{const button=form.querySelector('button');button.disabled=true;try{await request(body);const latest=await request();data.prices=latest.prices;renderPrices();status.textContent='Đã lưu. Trang mua hàng sẽ sử dụng cấu hình theo thời điểm hiệu lực.'}catch(error){status.textContent=error.message}finally{button.disabled=false}};
    panel.querySelector('#sales-settings-form').onsubmit=event=>{event.preventDefault();save(event.target,{action:'save_sales_setting',setting_key:'profile_link_help_video',url:video.value})};
    panel.querySelector('#sales-price-form').onsubmit=event=>{event.preventDefault();const form=event.target;save(form,{action:'set_product_price',product_id:product.value,unit_price_vnd:Number(form.elements.amount.value),effective_from:new Date(form.elements.effective.value).toISOString()})};
  }catch(error){console.error('Không thể đọc cấu hình bán hàng',error)}
})();
