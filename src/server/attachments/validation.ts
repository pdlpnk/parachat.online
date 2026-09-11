import { createHash } from 'node:crypto';
import { ATTACHMENT_LIMIT } from '../../lib/attachments';
import { StartError } from '../identity/service';
const types:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4'};
export function safeFilename(input:string){
 const name=input.replaceAll('\\','/').split('/').at(-1)!.normalize('NFC').replace(/[\p{C}]/gu,'').replace(/[<>:"|?*]/g,'_').trim();
 return [...name].slice(-180).join('')||'file';
}
export function validateFile(name:string,mime:string,bytes:Buffer){
 if(!bytes.length||bytes.length>ATTACHMENT_LIMIT)throw new StartError(413,'Файл должен быть не больше 10 MiB.');
 const displayFilename=safeFilename(name),ext=displayFilename.split('.').at(-1)!.toLowerCase();
 if(!types[ext]||types[ext]!==mime)throw new StartError(415,'Тип и расширение файла не совпадают или не поддерживаются.');
 let valid=false;
 if(mime==='image/jpeg')valid=bytes.length>4&&bytes.subarray(0,3).equals(Buffer.from([255,216,255]))&&bytes.subarray(-2).equals(Buffer.from([255,217]));
 if(mime==='image/png')valid=bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND';
 if(mime==='image/webp')valid=bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length&&bytes.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16));
 if(mime==='application/pdf')valid=/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(bytes.toString('ascii',0,8))&&/%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'));
 if(mime==='video/mp4'){
  // Validate ISO-BMFF top-level box bounds and MP4 brands; MOV/QuickTime excluded.
  let offset=0,ftyp=false,moov=false,mdat=false;
  while(offset+8<=bytes.length){let size=bytes.readUInt32BE(offset);const type=bytes.toString('ascii',offset+4,offset+8);let header=8;
   if(size===1){if(offset+16>bytes.length)break;const large=bytes.readBigUInt64BE(offset+8);if(large>BigInt(bytes.length))break;size=Number(large);header=16;}
   if(size===0)size=bytes.length-offset;if(size<header||offset+size>bytes.length)break;
   if(type==='ftyp'&&offset===0&&size>=16){const brand=bytes.toString('ascii',offset+header,offset+header+4);ftyp=['isom','iso2','mp41','mp42','avc1','M4V ','iso5','iso6'].includes(brand);}
   if(type==='moov')moov=size>header;if(type==='mdat')mdat=size>header;offset+=size;
  }valid=offset===bytes.length&&ftyp&&moov&&mdat;
 }
 if(!valid)throw new StartError(415,'Содержимое файла не соответствует его типу.');
 return {displayFilename,mediaType:mime,byteSize:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex')};
}
export type StoredAttachment=ReturnType<typeof validateFile>&{storageKey:string};
export function sameAttachment(prior:{checksum:string;displayFilename:string;mediaType:string;byteSize:number}[],file?:StoredAttachment){return file?prior.length===1&&prior[0]!.checksum===file.checksum&&prior[0]!.displayFilename===file.displayFilename&&prior[0]!.mediaType===file.mediaType&&prior[0]!.byteSize===file.byteSize:prior.length===0;}
