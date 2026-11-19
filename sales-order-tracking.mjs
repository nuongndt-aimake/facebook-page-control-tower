import crypto from 'node:crypto';
export function signOrderTracking(orderId, secret, now=Date.now()) {
  if(!secret)throw Error('Missing tracking secret');
  const payload=Buffer.from(JSON.stringify({id:orderId,exp:Math.floor(now/1000)+86400})).toString('base64url');
  return payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
}
export function verifyOrderTracking(token,orderId,secret,now=Date.now()) {
  try{if(!secret)return false;const [payload,signature,...extra]=String(token||'').split('.');if(extra.length||!payload||!signature)return false;
    const expected=crypto.createHmac('sha256',secret).update(payload).digest();const supplied=Buffer.from(signature,'base64url');
    if(expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied))return false;
    const claims=JSON.parse(Buffer.from(payload,'base64url'));return claims.id===orderId&&claims.exp>Math.floor(now/1000);
  }catch{return false}
}
