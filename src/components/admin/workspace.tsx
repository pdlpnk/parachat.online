'use client';
import { useCallback,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminDetail,AdminList,ConversationDTO,TagDTO } from '@/lib/admin';
import { localMessageTime } from '@/lib/messages';
import { BrandMark } from '../brand-mark';
import { TagFilter,tagClass } from './tags';
import { AdminConversation } from './conversation';
import { AdminRequestError,adminRequest,jsonRequest } from './client';
function DetailLoader({id,onUpdate,onBack}:{id:string;onUpdate:(v:ConversationDTO)=>void;onBack:()=>void}){
 const [detail,setDetail]=useState<AdminDetail|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();adminRequest<AdminDetail>(`/api/admin/conversations/${id}/messages`,{signal:controller.signal}).then(d=>{if(!controller.signal.aborted){setDetail(d);onUpdate(d.conversation);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Диалог недоступен.');});return()=>controller.abort();},[id,onUpdate,retry]);
 if(!detail)return <section className="admin-detail-placeholder"><button onClick={onBack}>← К списку</button><p role={error?'alert':'status'}>{error||'Загружаем диалог…'}</p>{error&&<button onClick={()=>{setError('');setRetry(n=>n+1);}}>Повторить</button>}</section>;
 return <AdminConversation id={id} initial={detail} onUpdate={onUpdate} onBack={onBack}/>;
}
export function AdminWorkspace({displayName}:{displayName:string}){
 const router=useRouter();const [state,setState]=useState('active'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0);
 const [list,setList]=useState<AdminList|null>(null),[tags,setTags]=useState<TagDTO[]>([]),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[expired,setExpired]=useState(false),[refresh,setRefresh]=useState(0);
 const [logoutBusy,setLogoutBusy]=useState(false);
 const onUpdate=useCallback((v:ConversationDTO)=>{setList(current=>current?{...current,conversations:current.conversations.map(row=>row.id===v.id?{...row,tags:v.tags}:row)}:current);},[]);
 const reload=useCallback(()=>setRefresh(v=>v+1),[]);
 useEffect(()=>{window.addEventListener("lina-tags-changed",reload);return()=>window.removeEventListener("lina-tags-changed",reload);},[reload]);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},220);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{
  if(expired)return;let disposed=false,running=false,again=false;let timer:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;
  const run=async()=>{if(disposed||document.hidden||running)return;running=true;controller=new AbortController();const signal=controller.signal;
   try{const params=new URLSearchParams({state,q:search,page:String(page)});if(filter)params.set('tag',filter);
    const [data,tagData]=await Promise.all([adminRequest<AdminList>(`/api/admin/conversations?${params}`,{signal}),adminRequest<{tags:TagDTO[]}>('/api/admin/tags',{signal})]);
    if(!disposed&&!signal.aborted){setList(data);setTags(tagData.tags);setError('');if(filter&&!tagData.tags.some(t=>t.id===filter)){setFilter('');setPage(0);}if(page>0&&data.conversations.length===0)setPage(Math.max(0,Math.ceil(data.total/50)-1));}
   }catch(e){if(!disposed&&!signal.aborted){if(e instanceof AdminRequestError&&e.status===401)setExpired(true);else setError(e instanceof Error?e.message:'Не удалось обновить список.');}}
   finally{running=false;if(!disposed&&!document.hidden){timer=setTimeout(()=>void run(),again?0:10000);again=false;}}
  };
  const visibility=()=>{clearTimeout(timer);if(document.hidden)controller?.abort();else if(running)again=true;else void run();};
  void run();document.addEventListener('visibilitychange',visibility);window.addEventListener('online',visibility);
  return()=>{disposed=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',visibility);};
 },[state,search,filter,page,refresh,expired]);
 return <main className={`admin-shell${selected?' admin-has-selection':''}`}>
 <aside className="admin-sidebar" aria-label="Список диалогов"><header className="admin-toolbar"><BrandMark small/><h1>LINA</h1><span className="admin-name">{displayName}</span><button disabled={logoutBusy} onClick={async()=>{if(logoutBusy)return;setLogoutBusy(true);try{await adminRequest('/api/admin/logout',jsonRequest({}));router.replace('/admin');router.refresh();}catch(e){if(e instanceof AdminRequestError&&e.status===401){router.replace('/admin');router.refresh();}else setError('Не удалось выйти. Повторите.');}finally{setLogoutBusy(false);}}}>Выйти</button></header>
 <div className="admin-tabs" aria-label="Раздел диалогов">{['active','archive'].map(tab=><button key={tab} aria-pressed={state===tab} onClick={()=>{setState(tab);setPage(0);setList(null);}}>{tab==='active'?'Active':'Archive'}{state===tab&&!!list?.unread&&<span className="unread-badge">{list.unread}</span>}</button>)}</div>
 <div className="admin-filters"><label className="sr-only" htmlFor="admin-search">Поиск по имени или LI ID</label><input id="admin-search" placeholder="Имя или LI ID" value={query} maxLength={80} onChange={e=>setQuery(e.target.value)}/><div className="admin-filter-row"><TagFilter tags={tags} value={filter} onChange={id=>{setFilter(id);setPage(0);setList(null);}}/></div></div>
 {expired?<p role="alert" className="admin-error">Сессия завершена. <a href="/admin">Войти снова</a></p>:error&&<p role="alert" className="admin-error">{error} <button onClick={reload}>Повторить</button></p>}
 <nav className="admin-list" aria-label="Диалоги">{!list?<p className="admin-empty">Загружаем…</p>:list.conversations.length===0?<p className="admin-empty">Диалогов пока нет</p>:list.conversations.map(v=><button key={v.id} className={`conversation-card${selected===v.id?' selected':''}`} aria-current={selected===v.id?'true':undefined} onClick={()=>{setSelected(v.id);setList(current=>current?{...current,conversations:current.conversations.map(row=>row.id===v.id?{...row,tags:v.tags}:row)}:current);}}><span className="client-emoji" aria-hidden="true">{v.avatarEmoji}</span><span className="conversation-summary"><span className="conversation-card-title"><strong>{v.displayName}</strong>{v.lastMessageAt&&<time dateTime={v.lastMessageAt}>{localMessageTime(v.lastMessageAt)}</time>}</span><span className="conversation-li">{v.liId}</span><span className="conversation-preview">{v.preview}</span><span className="tag-chips">{v.tags.slice(0,2).map(t=><span key={t.id} className={tagClass(t)}>{t.name}</span>)}{v.tags.length>2&&<span className="tag-chip">+{v.tags.length-2}</span>}</span></span>{v.unread>0&&<span className="unread-badge">{v.unread}</span>}</button>)}</nav>
 <footer className="admin-pagination"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>Назад</button><span>{list?`${page+1} / ${Math.max(1,Math.ceil(list.total/50))}`:'…'}</span><button disabled={!list||(page+1)*50>=list.total} onClick={()=>setPage(n=>n+1)}>Далее</button></footer></aside>
 {selected?<DetailLoader key={selected} id={selected} onUpdate={onUpdate} onBack={()=>{setSelected(null);reload();}}/>:<section className="admin-detail-placeholder"><BrandMark/><p>Выберите диалог</p></section>}
 </main>;
}
