import {Fragment} from 'react';
import {mobileNumbersInNote} from '@/lib/visit-note-phones';

export function VisitNote({text}:{text:string}){
  const numbers=mobileNumbersInNote(text);
  return <p className="visit-note-text">
    {text.slice(0,numbers[0]?.index)}
    {numbers.map(({text:number,index,href},position)=><Fragment key={index}>
      <a href={href}>{number}</a>
      {text.slice(index+number.length,numbers[position+1]?.index)}
    </Fragment>)}
  </p>;
}
