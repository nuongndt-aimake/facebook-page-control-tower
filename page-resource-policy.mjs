export const resourceKinds=['image','video'];
export function normalizeSheetUrl(value){
 if(!String(value||'').trim())return null;
 let url;try{url=new URL(String(value).trim())}catch{throw Error('Nhập liên kết Google Sheet hợp lệ')}
 const match=url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})\/(?:edit|view|preview)?\/?$/);
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.port||url.username||url.password||!match)throw Error('Chỉ dùng liên kết Google Sheet tại docs.google.com');
 const gid=new URLSearchParams(url.hash.slice(1)).get('gid')||url.searchParams.get('gid');if(gid&&!/^\d{1,12}$/.test(gid))throw Error('Tab Google Sheet không hợp lệ');
 return 'https://docs.google.com/spreadsheets/d/'+match[1]+'/edit'+(gid?'#gid='+gid:'');
}
export function sheetPreviewUrl(value){const canonical=normalizeSheetUrl(value);return canonical?.replace('/edit','/preview')||''}
export function normalizeResourceKinds(value){if(!Array.isArray(value)||value.some(v=>!resourceKinds.includes(v)))throw Error('Chọn kho hình ảnh hoặc video hợp lệ');return [...new Set(value)]}
