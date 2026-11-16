const mobileNumber=/(?<!\d|\d[-.])(?:0|\+82[ \t.-]?)1(?:0[ \t.-]?\d{4}|[16789][ \t.-]?\d{3,4})[ \t.-]?\d{4}(?!\d|[-.]\d)/g;

export function mobileNumbersInNote(note:string){
  return Array.from(note.matchAll(mobileNumber),({0:text,index=0})=>({
    text,
    index,
    href:'tel:'+text.replace(/[^\d+]/g,''),
  }));
}
