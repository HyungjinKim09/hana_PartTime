'use client';
import {useId} from 'react';
export function ScheduleField({path,label,value,onChange,errors={},required=false,type='text',maxLength,placeholder,multiline=false,disabled=false}:{path:string;label:string;value:string;onChange:(value:string)=>void;errors?:Record<string,string>;required?:boolean;type?:string;maxLength?:number;placeholder?:string;multiline?:boolean;disabled?:boolean}){
 const id=useId(),error=errors[path];
 const props={id,name:path,value,required,maxLength,placeholder,disabled,'aria-invalid':error?true:undefined,'aria-describedby':error?id+'-error':undefined,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange(event.target.value)};
 return <div className="schedule-field"><label htmlFor={id}>{label}{required&&<span aria-hidden="true"> *</span>}</label>
  {multiline?<textarea {...props} rows={4}/>:<input {...props} type={type} inputMode={path.endsWith('phones')?'tel':undefined}/>}
  {error&&<small id={id+'-error'} className="field-error">{error}</small>}
 </div>;
}
