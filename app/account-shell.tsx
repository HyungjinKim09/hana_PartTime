import type {ReactNode} from 'react';
import {FolderOpen} from 'lucide-react';

export function AccountShell({title,description,children,link}:{title:string;description:string;children:ReactNode;link:ReactNode}){
  return <main className="account-shell">
    <div className="account-brand" aria-label="HANA 현장조사 보관함">
      <span className="brand-mark"><FolderOpen size={24} aria-hidden="true"/></span>
      <div><strong>HANA</strong><span>현장조사 보관함</span></div>
    </div>
    <section className="account-content" aria-labelledby="account-title">
      <h1 id="account-title">{title}</h1>
      <p>{description}</p>
      {children}
      <div className="account-link">{link}</div>
    </section>
  </main>;
}
