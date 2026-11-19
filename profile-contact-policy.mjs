export function validateProfileContacts(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||!Object.keys(input).length||Object.keys(input).some(key=>!['phone','facebook_profile_url'].includes(key)))throw Error('Chỉ cập nhật số điện thoại và Profile Facebook của bạn.');
 const result={};if(Object.hasOwn(input,'phone')){const value=String(input.phone??'').trim(),digits=value.replace(/\D/g,'');if(value&&(!/^\+?[\d() .-]+$/.test(value)||digits.length<7||digits.length>15||value.length>32))throw Error('Số điện thoại không hợp lệ.');result.phone=value||null}
 if(Object.hasOwn(input,'facebook_profile_url')){const value=String(input.facebook_profile_url??'').trim();let normalized=null;if(value){let url;try{url=new URL(value)}catch{throw Error('Profile Facebook phải là URL HTTPS hợp lệ.')}if(url.protocol!=='https:'||!['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com'].includes(url.hostname)||url.username||url.password||url.pathname==='/'||value.length>2000)throw Error('Profile Facebook phải là liên kết https://facebook.com/... hợp lệ.');normalized=url.href}result.facebook_profile_url=normalized}
 return result;
}
