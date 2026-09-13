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
