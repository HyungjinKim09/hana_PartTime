/** Join OCR fragments inside a road name, retaining address boundaries.
 * @param {string} value
 * @returns {string}
 */
export function normalizeRoadAddress(value) {
  const text=value.normalize('NFC').replace(/\s+/g,' ').trim();
  // Restrict repair to a road suffix followed by a building number. Apartment
  // names, unit identifiers and free-form survey remarks are not rewritten.
  const match=text.match(/^(.*(?:로|길))\s*(\d.*)$/u);
  if(!match)return text;
  const numberParts=match[2].match(/^((?:\d(?: +\d(?= |[-–−]|$))+|\d+)(?: *[-–−] *(?:\d(?: +\d(?= |$))+|\d+))?)(.*)$/u);
  if(!numberParts)return text;
  const tokens=match[1].trim().split(' ');
  let boundary=-1;
  for(let i=0;i<tokens.length-1;i++)if(tokens[i].length>1&&/(?:특별시|광역시|자치시|도|시|군|구|읍|면|동|리)$/u.test(tokens[i]))boundary=i;
  const prefix=tokens.slice(0,boundary+1).join(' ');
  const fragments=tokens.slice(boundary+1);
  const fragmented=fragments.some(t=>/^[가-힣]$|^(?:대로|번길|\d+(?:번)?길)$/u.test(t));
  const road=fragments.join(fragmented?'':' ');
  const number=numberParts[1].replace(/\s/g,'').replace(/[–−]/g,'-');
  const extra=numberParts[2].trim();
  return `${prefix?prefix+' ':''}${road} ${number}${extra?(/^[동층호](?:\s|$)/u.test(extra)?'':' ')+extra:''}`;
}
