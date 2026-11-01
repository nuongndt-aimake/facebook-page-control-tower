(function(){
  const sb=supabase.createClient('https://tlcjcqqnfjrqsoiaalfk.supabase.co','sb_publishable_Q05ypFa4Ele00vyzy5X9Rw_tBWEJuvr');
  const $=s=>document.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(Number(x||0));
  const num=x=>new Intl.NumberFormat('vi-VN').format(Number(x||0));
  const period=$('#period'), section=document.body.dataset.report;
  async function run(){
    const s=(await sb.auth.getSession()).data.session;
    if(!s){$('#error').textContent='Hãy đăng nhập Google để xem báo cáo.';return}
    $('#who').textContent='Đã đăng nhập';
    const r=await fetch('/api/analytics?period='+encodeURIComponent(period.value),{cache:'no-store',headers:{Authorization:'Bearer '+s.access_token}}),d=await r.json();
    if(!r.ok)throw Error(d.error||'Không thể tải báo cáo');
    $('#range').textContent=d.range.label+' · '+d.range.start+' → '+d.range.end;
    if(section==='pages')renderPages(d);else if(section==='content')renderContent(d);else renderRevenue(d);
    $('#login').classList.add('hidden');$('#report').classList.remove('hidden');
  }
  function renderPages(d){const rows=(d.pages||[]).map((p,i)=>`<tr><td data-label="#">${i+1}</td><td data-label="Page"><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.id)}</span></td><td data-label="Nguồn">${esc(p.asset_scope==='bm'?'Trong BM':'Ngoài BM')}</td><td data-label="Bài đăng">${num(p.posts)}</td><td data-label="Tương tác">${num(p.interactions)}</td><td data-label="Doanh thu">${money(p.earnings)}</td><td data-label="Trạng thái"><span class="status-pill ${p.monetization_status==='earning'?'status-good':'status-none'}">${p.monetization_status==='earning'?'Có doanh thu':'Chưa xác định'}</span></td></tr>`).join('');$('#table').innerHTML=`<table><thead><tr><th>#</th><th>Page</th><th>Nguồn</th><th>Bài đăng</th><th>Tương tác</th><th>Doanh thu</th><th>Trạng thái</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Chưa có dữ liệu</td></tr>'}</tbody></table>`}
  function renderContent(d){const rows=(d.posts||[]).map((p,i)=>`<tr><td data-label="#">${i+1}</td><td data-label="Page">${esc(p.page_name||p.page_id)}</td><td data-label="Thời điểm">${p.created_time?new Date(p.created_time).toLocaleString('vi-VN'):'—'}</td><td data-label="Nội dung">${esc(p.message||'—')}</td><td data-label="Tương tác">${num(p.interactions?.total||0)}</td><td data-label="Liên kết">${p.permalink_url?`<a target="_blank" rel="noreferrer" href="${esc(p.permalink_url)}">Mở bài</a>`:'—'}</td></tr>`).join('');$('#table').innerHTML=`<table><thead><tr><th>#</th><th>Page</th><th>Thời điểm</th><th>Nội dung</th><th>Tương tác</th><th>Liên kết</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Chưa có bài đăng</td></tr>'}</tbody></table>`}
  function renderRevenue(d){const rows=(d.pages||[]).filter(p=>Number(p.earnings||0)>0).sort((a,b)=>Number(b.earnings)-Number(a.earnings)).map((p,i)=>`<tr><td data-label="#">${i+1}</td><td data-label="Page"><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.id)}</span></td><td data-label="Doanh thu USD"><strong>${money(p.earnings)}</strong></td><td data-label="Metric">${esc((p.metric_names||[]).join(', ')||'—')}</td><td data-label="Nguồn">${esc(p.asset_scope==='bm'?'Trong BM':'Ngoài BM')}</td></tr>`).join('');$('#table').innerHTML=`<table><thead><tr><th>#</th><th>Page</th><th>Doanh thu USD</th><th>Metric</th><th>Nguồn</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Chưa có doanh thu trong kỳ</td></tr>'}</tbody></table>`}
  period.onchange=()=>run();$('#google').onclick=()=>sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});run().catch(e=>$('#error').textContent=e.message);
})();
