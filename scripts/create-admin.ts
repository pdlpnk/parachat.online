import 'dotenv/config';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { utcDatabaseUrl } from '../src/server/database-config';
import { ADMIN_ACCOUNT_EMAIL, ADMIN_ACCOUNT_NAME } from '../src/server/admin/account';
import { passwordHash } from '../src/server/admin/password';
async function hidden(prompt:string):Promise<string>{
  stdout.write(prompt);emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();
  return new Promise((resolve,reject)=>{let text='';const listener=(_:string,key:{name?:string;ctrl?:boolean;sequence?:string})=>{
    if(key.ctrl&&key.name==='c'){cleanup();reject(new Error('Отменено.'));return;}
    if(key.name==='return'||key.name==='enter'){cleanup();resolve(text);return;}
    if(key.name==='backspace'){text=[...text].slice(0,-1).join('');return;}
    if(!key.ctrl&&key.sequence&&!/[\u0000-\u001f\u007f]/.test(key.sequence)&&text.length<1024)text+=key.sequence;
  };function cleanup(){stdin.off('keypress',listener);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}stdin.on('keypress',listener);});
}
async function main(){
  if(!stdin.isTTY||!stdout.isTTY)throw new Error('Нужен интерактивный терминал. Пароль не принимается через argv/env/pipe.');
  const url=process.env.DATABASE_URL;if(!url)throw new Error('Укажите DATABASE_URL через защищённый env-файл.');
  const target=new URL(url);stdout.write(`Создание Admin в ${target.hostname}:${target.port||5432}${target.pathname}\n`);
  const password=await hidden('Пароль (12–128 символов, ввод скрыт): ');
  if(password!==await hidden('Повторите пароль: '))throw new Error('Пароли не совпадают.');
  const hash=await passwordHash(password);
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:utcDatabaseUrl(url)})});
  try{if(await db.admin.findUnique({where:{email:ADMIN_ACCOUNT_EMAIL}}))throw new Error('Admin с общим доступом уже существует. Пароль не изменён.');
    await db.admin.create({data:{email:ADMIN_ACCOUNT_EMAIL,displayName:ADMIN_ACCOUNT_NAME,passwordHash:hash}});stdout.write('Admin создан. Пароль не сохранялся в открытом виде.\n');
  }finally{await db.$disconnect();}
}
main().catch(error=>{const safe=error instanceof Error&&['Нужен','Укажите','Отменено','Некорректный','Парол','Admin с'].some(p=>error.message.startsWith(p));stderrMessage(safe?error.message:'Не удалось создать Admin. Проверьте БД и уникальность email.');process.exitCode=1;});
function stderrMessage(message:string){process.stderr.write(message+'\n');}
