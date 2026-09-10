'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '../brand-mark';
import { adminRequest,jsonRequest } from './client';
export function AdminLogin(){
 const router=useRouter(),lock=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <main className="landing"><section className="name-card"><div className="landing-brand"><BrandMark/><h1>LINA</h1></div><h2>Вход для менеджера</h2><p className="landing-description">Управление личными диалогами</p><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');const form=e.currentTarget,data=new FormData(form);
 try{await adminRequest('/api/admin/login',jsonRequest({email:data.get('email'),password:data.get('password')}));form.reset();router.replace('/admin');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Не удалось войти.');}finally{lock.current=false;setBusy(false);}}}>
 <label htmlFor="admin-email">Email</label><input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={320} disabled={busy}/>
 <label htmlFor="admin-password">Пароль</label><input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy}/>
 {error&&<p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy?'Входим…':'Войти'}</button></form></section></main>;
}
