'use client';
/* eslint-disable @next/next/no-img-element -- Local blob preview; no public image optimizer. */
import { useEffect,useRef } from 'react';
import { fileSize } from '@/lib/attachments';
export function AttachmentPreview({file,onRemove,disabled}:{file:File;onRemove:()=>void;disabled:boolean}){
 const image=useRef<HTMLImageElement>(null);
 useEffect(()=>{if(!image.current)return;const objectUrl=URL.createObjectURL(file);image.current.src=objectUrl;return()=>URL.revokeObjectURL(objectUrl);},[file]);
 return <div className="attachment-preview">{file.type.startsWith('image/')?<img ref={image} alt="Предпросмотр вложения"/>:<span aria-hidden="true">{file.type==='video/mp4'?'▶':'PDF'}</span>}<span className="attachment-filename">{file.name}<small>{fileSize(file.size)}</small></span><button type="button" onClick={onRemove} disabled={disabled} aria-label="Убрать вложение">×</button></div>;
}
