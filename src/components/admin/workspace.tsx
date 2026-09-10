'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminDetail,AdminList,ConversationDTO,TagDTO } from '@/lib/admin';
import { localMessageTime } from '@/lib/messages';
import { BrandMark } from '../brand-mark';
import { AdminConversation } from './conversation';
import { AdminRequestError,adminRequest,jsonRequest } from './client';
function DetailLoader({id,onUpdate,onBack,onTags}:{id:string;onUpdate:(v:ConversationDTO)=>void;onBack:()=>void;onTags:()=>void}){
 const [detail,setDetail]=useState<AdminDetail|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();adminRequest<AdminDetail>(`/api/admin/conversations/${id}/messages`,{signal:controller.signal}).then(d=>{if(!controller.signal.aborted){setDetail(d);onUpdate(d.conversation);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Диалог недоступен.');});return()=>controller.abort();},[id,onUpdate,retry]);
 if(!detail)return <section className="admin-detail-placeholder"><button onClick={onBack}>← К списку</button><p role={error?'alert':'status'}>{error||'Загружаем диалог…'}</p>{error&&<button onClick={()=>{setError('');setRetry(n=>n+1);}}>Повторить</button>}</section>;
 return <AdminConversation id={id} initial={detail} onUpdate={onUpdate} onBack={onBack} onTags={onTags}/>;
}
export function AdminWorkspace({displayName}:{displayName:string}){
 const router=useRouter();const [state,setState]=useState('active'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0);
 const [list,setList]=useState<AdminList|null>(null),[tags,setTags]=useState<TagDTO[]>([]),[selected,setSelected]=useState<string|null>(null),[metadata,setMetadata]=useState<ConversationDTO|null>(null),[error,setError]=useState(''),[expired,setExpired]=useState(false),[tagDialog,setTagDialog]=useState(false),[refresh,setRefresh]=useState(0);
 const [logoutBusy,setLogoutBusy]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
 const onUpdate=useCallback((v:ConversationDTO)=>{setMetadata(v);},[]);
 const reload=useCallback(()=>setRefresh(v=>v+1),[]);
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
 useEffect(()=>{if(tagDialog)dialog.current?.showModal();else dialog.current?.close();},[tagDialog]);
 return <main className={`admin-shell${selected?' admin-has-selection':''}`}>
 <aside className="admin-sidebar" aria-label="Список диалогов"><header className="admin-toolbar"><BrandMark small/><h1>LINA</h1><span className="admin-name">{displayName}</span><button disabled={logoutBusy} onClick={async()=>{if(logoutBusy)return;setLogoutBusy(true);try{await adminRequest('/api/admin/logout',jsonRequest({}));router.replace('/admin');router.refresh();}catch(e){if(e instanceof AdminRequestError&&e.status===401){router.replace('/admin');router.refresh();}else setError('Не удалось выйти. Повторите.');}finally{setLogoutBusy(false);}}}>Выйти</button></header>
 <div className="admin-tabs" aria-label="Раздел диалогов">{['active','archive'].map(tab=><button key={tab} aria-pressed={state===tab} onClick={()=>{setState(tab);setPage(0);setList(null);}}>{tab==='active'?'Active':'Archive'}{state===tab&&!!list?.unread&&<span className="unread-badge">{list.unread}</span>}</button>)}</div>
 <div className="admin-filters"><label className="sr-only" htmlFor="admin-search">Поиск по имени или LI ID</label><input id="admin-search" placeholder="Имя или LI ID" value={query} maxLength={80} onChange={e=>setQuery(e.target.value)}/><div className="admin-filter-row"><label className="sr-only" htmlFor="tag-filter">Фильтр по тегу</label><select id="tag-filter" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);setList(null);}}><option value="">Все теги</option>{tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button onClick={()=>setTagDialog(true)}>Управлять тегами</button></div></div>
 {expired?<p role="alert" className="admin-error">Сессия завершена. <a href="/admin">Войти снова</a></p>:error&&<p role="alert" className="admin-error">{error} <button onClick={reload}>Повторить</button></p>}
 <nav className="admin-list" aria-label="Диалоги">{!list?<p className="admin-empty">Загружаем…</p>:list.conversations.length===0?<p className="admin-empty">Диалогов пока нет</p>:list.conversations.map(v=><button key={v.id} className={`conversation-card${selected===v.id?' selected':''}`} aria-current={selected===v.id?'true':undefined} onClick={()=>{setSelected(v.id);setMetadata(v);}}><span className="client-emoji" aria-hidden="true">{v.avatarEmoji}</span><span className="conversation-summary"><span className="conversation-card-title"><strong>{v.displayName}</strong>{v.lastMessageAt&&<time dateTime={v.lastMessageAt}>{localMessageTime(v.lastMessageAt)}</time>}</span><span className="conversation-li">{v.liId}</span><span className="conversation-preview">{v.preview}</span><span className="tag-chips">{v.tags.slice(0,3).map(t=><span key={t.id} className="tag-chip">{t.name}</span>)}{v.tags.length>3&&<span className="tag-chip">+{v.tags.length-3}</span>}</span></span>{v.unread>0&&<span className="unread-badge">{v.unread}</span>}</button>)}</nav>
 <footer className="admin-pagination"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>Назад</button><span>{list?`${page+1} / ${Math.max(1,Math.ceil(list.total/50))}`:'…'}</span><button disabled={!list||(page+1)*50>=list.total} onClick={()=>setPage(n=>n+1)}>Далее</button></footer></aside>
 {selected?<DetailLoader key={selected} id={selected} onUpdate={onUpdate} onBack={()=>{setSelected(null);setMetadata(null);reload();}} onTags={()=>setTagDialog(true)}/>:<section className="admin-detail-placeholder"><BrandMark/><p>Выберите диалог</p></section>}
 <dialog className="admin-tag-dialog" ref={dialog} onClose={()=>setTagDialog(false)}><TagManager key={tagDialog?'open':'closed'} tags={tags} conversation={selected&&metadata?.id===selected?metadata:null} onClose={()=>setTagDialog(false)} onChange={()=>{reload();}} onTags={setTags}/></dialog>
 </main>;
}
function TagManager({tags,conversation,onClose,onChange,onTags}:{tags:TagDTO[];conversation:ConversationDTO|null;onClose:()=>void;onChange:()=>void;onTags:(tags:TagDTO[])=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attached,setAttached]=useState(conversation?.tags.map(t=>t.id)??[]),[deleteId,setDeleteId]=useState('');const lock=useRef(false);
 async function mutate(url:string,body:object,method='POST',after?:()=>void){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await adminRequest(url,jsonRequest(body,method));after?.();const data=await adminRequest<{tags:TagDTO[]}>('/api/admin/tags');onTags(data.tags);onChange();}catch(e){setError(e instanceof Error?e.message:'Не удалось изменить тег.');}finally{lock.current=false;setBusy(false);}}
 return <><header><h2>Теги{conversation?` · ${conversation.liId}`:''}</h2><button onClick={onClose} aria-label="Закрыть теги">✕</button></header>{conversation&&<p>Отметьте теги этого клиента.</p>}{error&&<p className="error" role="alert">{error}</p>}<form className="tag-create" onSubmit={e=>{e.preventDefault();void mutate('/api/admin/tags',{name},'POST',()=>setName(''));}}><label className="sr-only" htmlFor="new-tag">Новый тег</label><input id="new-tag" placeholder="Новый тег" value={name} maxLength={120} onChange={e=>setName(e.target.value)} disabled={busy}/><button disabled={busy||!name.trim()}>Создать</button></form><div className="tag-manager-list">{tags.map(t=><form key={t.id} className="tag-manager-row" onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('name');void mutate(`/api/admin/tags/${t.id}`,{name:value},'PATCH');}}>
 {conversation&&<input type="checkbox" aria-label={`Назначить тег ${t.name}`} checked={attached.includes(t.id)} disabled={busy} onChange={e=>{const next=e.target.checked;void mutate(`/api/admin/conversations/${conversation.id}/tags`,{tagId:t.id,attached:next},'POST',()=>setAttached(ids=>next?[...new Set([...ids,t.id])]:ids.filter(id=>id!==t.id)));}}/>}
 <input name="name" aria-label={`Название тега ${t.name}`} defaultValue={t.name} key={t.name} maxLength={120} disabled={busy}/><button disabled={busy} aria-label={`Сохранить тег ${t.name}`}>✓</button><button type="button" disabled={busy} aria-label={`Удалить тег ${t.name}`} onClick={()=>setDeleteId(t.id)}>×</button>{deleteId===t.id&&<div className="tag-delete-confirm">Удалить тег у всех клиентов? <button type="button" disabled={busy} onClick={()=>void mutate(`/api/admin/tags/${t.id}`,{},'DELETE',()=>setDeleteId(''))}>Удалить</button><button type="button" onClick={()=>setDeleteId('')}>Отмена</button></div>}</form>)}</div></>;
}
