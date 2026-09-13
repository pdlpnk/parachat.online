'use client';
import {WORDS} from "@/lib/player-i18n";
import type {Locale} from "@/lib/preferences";
/* eslint-disable @next/next/no-img-element -- Local blob preview; no public image optimizer. */
import { useEffect,useRef } from 'react';
import { fileSize } from '@/lib/attachments';
export function AttachmentPreview({file,onRemove,disabled,locale="RU"}:{locale?:Locale;file:File;onRemove:()=>void;disabled:boolean}){
 const t=WORDS[locale];
 const image=useRef<HTMLImageElement>(null);
 useEffect(()=>{if(!image.current)return;const objectUrl=URL.createObjectURL(file);image.current.src=objectUrl;return()=>URL.revokeObjectURL(objectUrl);},[file]);
 return <div className="attachment-preview">{file.type.startsWith('image/')?<img ref={image} alt={t.preview}/>:<span aria-hidden="true">{file.type==='video/mp4'?'▶':'PDF'}</span>}<span className="attachment-filename" dir="auto">{file.name}<small>{fileSize(file.size)}</small></span><button type="button" onClick={onRemove} disabled={disabled} aria-label={t.remove}>×</button></div>;
}
