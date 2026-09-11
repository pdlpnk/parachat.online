import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFile,safeFilename} from '../../src/server/attachments/validation';
import {storagePath} from '../../src/server/attachments/storage';
import {validTagColor} from '../../src/lib/tag-colors';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64');
const box=(type:string,data:Buffer)=>{const b=Buffer.alloc(8+data.length);b.writeUInt32BE(b.length);b.write(type,4);data.copy(b,8);return b;};
test('attachment magic allows PNG JPEG WebP PDF and bounded MP4 box structure',()=>{
 assert.equal(validateFile('image.png','image/png',png).byteSize,png.length);
 assert.equal(validateFile('photo.jpg','image/jpeg',Buffer.from('ffd8ffe00000ffd9','hex')).mediaType,'image/jpeg');
 const webp=Buffer.alloc(20);webp.write('RIFF');webp.writeUInt32LE(12,4);webp.write('WEBPVP8 ',8);assert.equal(validateFile('x.webp','image/webp',webp).mediaType,'image/webp');
 assert.equal(validateFile('x.pdf','application/pdf',Buffer.from('%PDF-1.7\n%%EOF\n')).mediaType,'application/pdf');
 const mp4=Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',Buffer.from('0000')),box('mdat',Buffer.from('0000'))]);assert.equal(validateFile('x.mp4','video/mp4',mp4).mediaType,'video/mp4');assert.throws(()=>validateFile('x.mp4','video/mp4',mp4.subarray(0,-1)),{status:415});
});
test('rejects MIME, extension and magic mismatches, executable types and oversized content',()=>{
 for(const [name,mime,bytes] of [['x.jpg','image/png',png],['x.png','image/jpeg',png],['x.png','image/png',Buffer.from('<html>')],['x.svg','image/svg+xml',Buffer.from('<svg/>')],['x.exe','application/octet-stream',Buffer.from('MZ')]] as const)assert.throws(()=>validateFile(name,mime,bytes),{status:415});
 assert.throws(()=>validateFile('x.png','image/png',Buffer.alloc(10*1024*1024+1)),{status:413});
});
test('filenames sanitized and storage path accepts only generated opaque keys',()=>{
 assert.equal(safeFilename('../../folder/evil\r\n.png'),'evil.png');assert.equal(safeFilename('C:\\temp\\file.pdf'),'file.pdf');
 for(const key of ['../secret','/etc/passwd','x.png','a'.repeat(32)+'/..','%2e%2e'])assert.throws(()=>storagePath('/private/uploads',key),{status:404});
 assert.equal(storagePath('/private/uploads','a'.repeat(32)),'/private/uploads/'+'a'.repeat(32));
});
test('tag colors accept only palette tokens',()=>{assert.ok(validTagColor('blue'));assert.ok(validTagColor('gray'));for(const c of ['#fff','url(x)','RED',null])assert.equal(validTagColor(c),false);});
