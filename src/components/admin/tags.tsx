'use client';
import { useEffect,useRef,useState } from 'react';
import type { ConversationDTO,TagDTO } from '@/lib/admin';
import { TAG_COLORS,validTagColor } from '@/lib/tag-colors';
import { adminRequest,jsonRequest } from './client';
export const tagClass=(tag:TagDTO)=>`tag-chip tag-${validTagColor(tag.color)?tag.color:'gray'}`;
export function TagFilter({tags,value,onChange}:{tags:TagDTO[];value:string;onChange:(id:string)=>void}){
 const panel=useRef<HTMLDetailsElement>(null),selected=tags.find(t=>t.id===value);
 return <details className="tag-filter-popover" ref={panel}><summary aria-label="Фильтр по тегу" className={selected?tagClass(selected):'tag-chip tag-gray'}>{selected?.name??'Все теги'} ▾</summary><div className="tag-filter-options"><button onClick={()=>{onChange('');panel.current?.removeAttribute('open');}}>Все теги</button>{tags.map(t=><button key={t.id} className={tagClass(t)} aria-pressed={t.id===value} onClick={()=>{onChange(t.id);panel.current?.removeAttribute('open');}}>{t.name}</button>)}</div></details>;
}
export function ConversationTags({conversation,onChange}:{conversation:ConversationDTO;onChange:(tags:TagDTO[])=>void}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true);
 const [open,setOpen]=useState(false),[tags,setTags]=useState<TagDTO[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[color,setColor]=useState('gray'),[edit,setEdit]=useState<string|null>(null),[confirm,setConfirm]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!open){dialog.current?.close();return;}dialog.current?.showModal();const controller=new AbortController();adminRequest<{tags:TagDTO[]}>('/api/admin/tags',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setTags(data.tags);}).catch(()=>{if(!controller.signal.aborted)setError('Не удалось загрузить теги.');});return()=>controller.abort();},[open]);
 async function action(run:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await run();window.dispatchEvent(new Event("lina-tags-changed"));}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Не удалось изменить тег.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function toggle(t:TagDTO){const assigned=conversation.tags.some(v=>v.id===t.id);await adminRequest(`/api/admin/conversations/${conversation.id}/tags`,jsonRequest({tagId:t.id,attached:!assigned}));if(alive.current)onChange(assigned?conversation.tags.filter(v=>v.id!==t.id):[...conversation.tags,t]);}
 return <div className="admin-detail-tags">{conversation.tags.map(t=><button key={t.id} className={tagClass(t)} disabled={busy} aria-label={`Снять тег ${t.name}`} onClick={()=>void action(()=>toggle(t))}>{t.name} ×</button>)}<button className="tag-chip tag-add" aria-label="Добавить тег" onClick={()=>{setOpen(true);setEdit(null);setError('');}}>+</button>
 <dialog className="tag-picker" ref={dialog} onClose={()=>setOpen(false)}><header><h2>{edit?'Изменить тег':'Теги'}</h2><button type="button" aria-label="Закрыть теги" onClick={()=>setOpen(false)}>×</button></header>
 {error&&<p role="alert" className="error">{error}</p>}
 <div className="tag-picker-list">{tags.map(t=><div className="tag-picker-row" key={t.id}><button className={tagClass(t)} aria-pressed={conversation.tags.some(a=>a.id===t.id)} disabled={busy} onClick={()=>void action(()=>toggle(t))}>{conversation.tags.some(a=>a.id===t.id)?'✓ ':''}{t.name}</button><button className="tag-edit" aria-label={`Изменить тег ${t.name}`} disabled={busy} onClick={()=>{setEdit(t.id);setName(t.name);setColor(t.color);setConfirm(false);}}>✎</button></div>)}</div>
 <form onSubmit={e=>{e.preventDefault();void action(async()=>{const saved=await adminRequest<TagDTO>(edit?`/api/admin/tags/${edit}`:'/api/admin/tags',jsonRequest({name,color},edit?'PATCH':'POST'));if(!alive.current)return;setTags(v=>edit?v.map(t=>t.id===edit?saved:t):[...v,saved]);if(edit)onChange(conversation.tags.map(t=>t.id===edit?saved:t));else await toggle(saved);setEdit(null);setName('');setColor('gray');});}}>
 <label htmlFor="tag-name">{edit?'Название тега':'Новый тег'}</label><input id="tag-name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} disabled={busy}/>
 <div className="tag-palette" aria-label="Цвет тега">{TAG_COLORS.map(c=><button type="button" key={c} className={`tag-chip tag-${c}`} aria-label={`Цвет ${c}`} aria-pressed={color===c} disabled={busy} onClick={()=>setColor(c)}>●</button>)}</div>
 <button disabled={busy||!name.trim()}>{edit?'Сохранить':'Создать'}</button>{edit&&<button type="button" onClick={()=>{setEdit(null);setName('');setConfirm(false);}}>Отмена</button>}
 {edit&&<button type="button" disabled={busy} onClick={()=>{if(!confirm){setConfirm(true);return;}void action(async()=>{await adminRequest(`/api/admin/tags/${edit}`,jsonRequest({},'DELETE'));if(!alive.current)return;setTags(v=>v.filter(t=>t.id!==edit));onChange(conversation.tags.filter(t=>t.id!==edit));setEdit(null);setName('');setConfirm(false);});}}>{confirm?'Подтвердить удаление у всех':'Удалить тег…'}</button>}
 </form></dialog></div>;
}
