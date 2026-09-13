export const THEMES = ['light','emerald','purple','orange','coral'] as const;
export const FONTS = ['modern','soft','tech'] as const;
export const LOCALES = ['RU','EN','TR','AZ','FA'] as const;
export type Locale = typeof LOCALES[number];
export type Preferences = { theme: typeof THEMES[number]; font: typeof FONTS[number]; locale: Locale };
export const DEFAULT_PREFERENCES: Preferences = {theme:'light',font:'modern',locale:'RU'};
export const LANGUAGE_NAMES: Record<Locale,string> = {RU:'Русский',EN:'English',TR:'Türkçe',AZ:'Azərbaycan',FA:'فارسی'};
export const THEME_NAMES = ['LINA Light','Carbon + Emerald','Graphite + Purple','Warm Black + Orange','Black + Red Coral'];
export function browserLocale(language:string):Locale { const base=language.split(/[-_]/)[0]?.toUpperCase();return LOCALES.includes(base as Locale)?base as Locale:'EN'; }
export function validLocale(value:unknown):value is Locale{return LOCALES.includes(value as Locale);}
export function preferencePatch(value:unknown):Partial<Preferences>|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const entries=Object.entries(value);if(!entries.length||entries.some(([k,v])=>!(k==='theme'?THEMES:k==='font'?FONTS:k==='locale'?LOCALES:[]).includes(v as never)))return null;
 return value as Partial<Preferences>;
}
