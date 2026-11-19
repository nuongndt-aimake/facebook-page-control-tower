export const operationScopes=['manage_payout','verify_reports','read_reports_all'];
export const isOperationsAdmin=context=>['platform_admin','super_admin'].includes(context?.profile?.role);
export function canOperate(context,scope){
 if(!operationScopes.includes(scope))return false;if(isOperationsAdmin(context))return true;
 const grants=context?.profile?.permissions?.sales_operations;
 return grants===true||grants==='*'||Array.isArray(grants)&&(grants.includes(scope)||grants.includes('*'));
}
export function summarizeReports(reports){
 const valid=reports.filter(row=>row.status!=='rejected'),latest=new Map();
 const currency=row=>row.currency||'VND',revenue=row=>Number(row.revenue_amount??row.revenue_vnd??0),cumulative=row=>Number(row.cumulative_amount??row.cumulative_revenue_vnd??0);
 for(const row of valid){const key=row.assignment_id+':'+currency(row),previous=latest.get(key);if(!previous||row.report_date>previous.report_date)latest.set(key,row)}
 const total=rows=>({posts:rows.reduce((n,r)=>n+Number(r.published_post_count||0),0),revenue_vnd:rows.filter(r=>currency(r)==='VND').reduce((n,r)=>n+revenue(r),0),reports:rows.length});
 const currencies=(rows,last)=>[...new Set(rows.map(currency))].sort().map(unit=>({currency:unit,revenue_amount:rows.filter(r=>currency(r)===unit).reduce((n,r)=>n+revenue(r),0),verified_revenue_amount:rows.filter(r=>currency(r)===unit&&r.status==='verified').reduce((n,r)=>n+revenue(r),0),cumulative_amount:last.filter(r=>currency(r)===unit).reduce((n,r)=>n+cumulative(r),0)}));
 const group=field=>{const map=new Map();for(const row of valid){const key=row[field];if(!map.has(key))map.set(key,[]);map.get(key).push(row)}return [...map].map(([id,rows])=>{const last=[...latest.values()].filter(r=>r[field]===id);return {id,...total(rows),verified:total(rows.filter(r=>r.status==='verified')),cumulative_revenue_vnd:last.filter(r=>currency(r)==='VND').reduce((n,r)=>n+cumulative(r),0),by_currency:currencies(rows,last)}})};
 return {reported:total(valid),verified:total(valid.filter(r=>r.status==='verified')),cumulative_revenue_vnd:[...latest.values()].filter(r=>currency(r)==='VND').reduce((n,r)=>n+cumulative(r),0),by_currency:currencies(valid,[...latest.values()]),by_person:group('reporter_user_id'),by_page:group('page_id')};
}
