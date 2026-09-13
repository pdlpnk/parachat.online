import type { PrismaClient } from '../../generated/prisma/client';
import { THEMES } from '../../lib/preferences';
import { StartError } from '../identity/service';
import { authenticateAdmin, txOptions } from './auth';
export async function saveAdminTheme(db: PrismaClient, raw: string | undefined, theme: unknown) {
 return db.$transaction(async tx => {
  const admin = await authenticateAdmin(tx, raw, true);
  if(typeof theme !== 'string' || !THEMES.includes(theme as typeof THEMES[number])) throw new StartError(400, 'Некорректная тема.');
  const saved = await tx.admin.update({where:{id:admin.id},data:{uiTheme:theme},select:{uiTheme:true}});
  return {theme:saved.uiTheme};
 }, txOptions);
}
