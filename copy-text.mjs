export async function copyText(value){
 const text=String(value??'');try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return}}catch{}
 const previous=document.activeElement,input=document.createElement('textarea');input.value=text;input.readOnly=true;input.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();previous?.focus();if(!copied)throw Error('Không thể sao chép. Vui lòng chọn nội dung và nhấn Ctrl+C.');
}
