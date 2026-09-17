import Workspace from './workspace';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){
  const user=await getChatGPTUser();
  if(!user) return <main className="signin"><div className="brand-mark">F</div><p className="eyebrow">FIELDNOTE</p><h1>나의 현장 사진 보관함</h1><p>현장 사진과 연락처는 비공개로 보관합니다.<br/>휴대폰과 PC에서 같은 ChatGPT 계정으로 로그인해 주세요.</p><a className="primary-button" href={chatGPTSignInPath('/')} target="_top">ChatGPT로 로그인</a></main>;
  return <Workspace userName={user.displayName}/>;
}
