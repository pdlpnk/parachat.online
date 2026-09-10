import { AdminLogin } from '@/components/admin/login';
import { adminContext } from '@/server/admin/http';
import { adminSession } from '@/server/admin/auth';
import { StartError } from '@/server/identity/service';
import { AdminWorkspace } from '@/components/admin/workspace';
export const dynamic='force-dynamic';
export default async function AdminPage(){
  let admin;
  try{admin=await adminSession(...await adminContext());}catch(e){
    if(!(e instanceof StartError&&e.status===401))return <main className="landing"><p role="alert">Admin временно недоступен. Обновите страницу.</p></main>;
  }
  if(!admin)return <AdminLogin/>;
  return <AdminWorkspace displayName="Менеджер"/>;
}
