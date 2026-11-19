export const reportCurrency=report=>report.currency||'VND';
export const reportRevenue=report=>Number(report.revenue_amount??report.revenue_vnd??0);
export const reportCumulative=report=>Number(report.cumulative_amount??report.cumulative_revenue_vnd??0);
export function formatReportMoney(value,currency='USD'){return new Intl.NumberFormat(currency==='USD'?'en-US':'vi-VN',{style:'currency',currency,minimumFractionDigits:currency==='USD'?2:0,maximumFractionDigits:2}).format(Number(value||0))}
export function formatReportTotals(rows,field='revenue_amount'){return rows?.length?rows.map(row=>formatReportMoney(row[field],row.currency)).join(' · '):formatReportMoney(0,'USD')}
