import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LOCALES,THEMES,FONTS,browserLocale,preferencePatch} from '../../src/lib/preferences';
import {systemText} from '../../src/lib/player';
import {WORDS} from '../../src/lib/player-i18n';
test('preference whitelist rejects arbitrary CSS/font/locale and ownership fields',()=>{
 for(const theme of THEMES)assert.deepEqual(preferencePatch({theme}),{theme});
 for(const font of FONTS)assert.deepEqual(preferencePatch({font}),{font});
 for(const locale of LOCALES)assert.deepEqual(preferencePatch({locale}),{locale});
 for(const v of [{theme:'url(x)'},{font:'Comic Sans'},{locale:'DE'},{clientId:'x'},{theme:'light',id:'x'},{},[],null])assert.equal(preferencePatch(v),null);
});
test('browser language preselect and fallback',()=>{for(const [s,l] of [['ru-RU','RU'],['tr','TR'],['az-Latn','AZ'],['fa-IR','FA'],['en-US','EN'],['de-DE','EN'],['','EN']])assert.equal(browserLocale(s!),l);});
test('all locales resolve structured welcome without mutating message params',()=>{
 const params={name:'Lina'};const texts=LOCALES.map(l=>systemText('system.welcome',params,l));assert.equal(new Set(texts).size,5);
 for(const l of LOCALES){assert.ok(systemText('system.welcome',params,l).includes('Lina'));assert.equal(systemText('unknown',params,l),WORDS[l].system);assert.deepEqual(Object.keys(WORDS[l]).sort(),Object.keys(WORDS.EN).sort());}
 assert.deepEqual(params,{name:'Lina'});assert.ok(systemText('system.welcome',{name:'$&'},'EN').includes('$&'));
});
test('Stage 7 approved Russian welcome is exact',()=>{
 assert.equal(systemText('system.welcome',{name:'Роман'},'RU'),`Привет, Роман! 👋

Отлично, теперь мы на связи!

Я LINA — твой персональный ассистент. Здесь мы будем обсуждать рабочие моменты, разбирать возможности заработка и двигаться к первым результатам. 🚀

Я помогу тебе разобраться в процессе и отвечу на вопросы.

Скажи, ты уже знаком с нашей системой или начинаешь с нуля?`);
});
test('Stage 7 landing and welcome translations cover every locale',()=>{
 for(const locale of LOCALES){const t=WORDS[locale];assert.ok(t.title&&t.subtitle&&t.name&&t.namePlaceholder&&t.start);assert.equal(t.welcome.split('\n\n').length,5);assert.equal((t.welcome.match(/\{name\}/g)||[]).length,1);assert.ok(t.welcome.includes('LINA'));}
 assert.equal(WORDS.RU.title,'Добро пожаловать!');assert.equal(WORDS.RU.subtitle,'Ваш персональный ассистент уже ждёт вас.');assert.equal(WORDS.RU.start,'Перейти в чат →');
});
