'use client';
import {useRef,useState} from 'react';
import {THEMES,FONTS,LOCALES,THEME_NAMES,LANGUAGE_NAMES,type Preferences} from '@/lib/preferences';
import {WORDS} from '@/lib/player-i18n';
export function LanguagePicker({value,onChange,disabled=false}:{value:Preferences['locale'];onChange:(v:Preferences['locale'])=>void;disabled?:boolean}){
 return <div className="language-options" role="group" aria-label={WORDS[value].language}>{LOCALES.map(l=><button key={l} type="button" lang={l.toLowerCase()} dir={l==='FA'?'rtl':'ltr'} aria-pressed={l===value} disabled={disabled} onClick={()=>onChange(l)}>{LANGUAGE_NAMES[l]}</button>)}</div>;
}
export function PlayerSettings({value,onChange,admin=false}:{value:Preferences;onChange:(v:Preferences)=>void;admin?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),locked=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);const t=WORDS[value.locale];
 async function save(patch:Partial<Preferences>){
  if(locked.current)return;locked.current=true;setBusy(true);setError(false);const prior=value;onChange({...value,...patch});
  try{const r=await fetch(admin?'/api/admin/preferences':'/api/player/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();onChange({...value,...await r.json() as Partial<Preferences>});}
  catch{onChange(prior);setError(true);}finally{locked.current=false;setBusy(false);}
 }
 return <><button ref={trigger} type="button" className="icon-button settings-trigger" aria-label={t.settings} onClick={()=>dialog.current?.showModal()}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button>
 <dialog className="player-settings" ref={dialog} onKeyDown={e=>{if(e.key!=="Tab")return;const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} onClose={()=>trigger.current?.focus()} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}} aria-label={t.settings}>
 <header><h2>{t.settings}</h2><button type="button" className="icon-button" aria-label={t.close} onClick={()=>dialog.current?.close()}>×</button></header>
 <section><h3>{t.appearance}</h3><div className="theme-options" role="group" aria-label={t.appearance}>{THEMES.map((theme,i)=><button type="button" key={theme} className={`theme-swatch swatch-${theme}`} aria-label={THEME_NAMES[i]} aria-pressed={value.theme===theme} disabled={busy} onClick={()=>void save({theme})}><span>{value.theme===theme?'✓':''}</span></button>)}</div><p className="theme-name">{THEME_NAMES[THEMES.indexOf(value.theme)]}</p></section>
 {!admin&&<><section><h3>{t.font}</h3><div className="font-options" role="group" aria-label={t.font}>{FONTS.map(font=><button type="button" key={font} data-font={font} aria-pressed={value.font===font} disabled={busy} onClick={()=>void save({font})}>{font.charAt(0).toUpperCase()+font.slice(1)}</button>)}</div></section>
 <section><h3>{t.language}</h3><LanguagePicker value={value.locale} disabled={busy} onChange={locale=>void save({locale})}/></section></>}
 <p role={error?'alert':'status'} className={error?'error':'settings-status'}>{error?t.saveError:busy?t.saving:t.saved}</p>
 </dialog></>;
}
