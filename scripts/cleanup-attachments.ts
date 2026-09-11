import 'dotenv/config';
import {readdir,lstat,unlink} from 'node:fs/promises';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../src/generated/prisma/client';
import {utcDatabaseUrl} from '../src/server/database-config';
import {storageRoot,storagePath} from '../src/server/attachments/storage';
async function main(){
 if(process.argv.slice(2).some(v=>v!=='--delete'))throw Error('Use no arguments for dry run, --delete for confirmed cleanup.');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required.');
 const root=await storageRoot(),db=new PrismaClient({adapter:new PrismaPg({connectionString:utcDatabaseUrl(process.env.DATABASE_URL)})});let count=0;
 try{for(const key of await readdir(root)){if(!/^[a-f0-9]{32}$/.test(key))continue;const file=storagePath(root,key),stat=await lstat(file);if(!stat.isFile()||stat.mtimeMs>Date.now()-86400000)continue;
  if(await db.attachment.findUnique({where:{storageKey:key},select:{id:true}}))continue;
  if(process.argv.includes('--delete'))await unlink(file);count++;
 }console.log(`${process.argv.includes('--delete')?'Removed':'Dry run: eligible'} orphan files: ${count}`);
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Cleanup stopped. Check database/storage access; no secrets logged.');process.exitCode=1;});
