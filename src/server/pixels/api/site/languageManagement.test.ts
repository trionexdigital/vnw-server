import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LanguageManagement,PUBLIC_LANGUAGES,sourceHash,validateEntry,languageCode,catalogVersion } from './languageManagement';
const prepare=()=>{
  const service:any=new LanguageManagement();let state:any[]=[];let sources:any[]=[];let staged:any[]=[];let committed=0,rolledBack=0,started=0;
  const connection={beginTransaction:async()=>{started++;staged=state.map(r=>({...r}));},query:async(sql:string,p:any[])=>{
    if(sql.startsWith('INSERT IGNORE INTO language_sources')) {if(!sources.some(r=>r.source_hash===p[0]))sources.push({source_hash:p[0],source:p[1],context:p[2]});return[{affectedRows:1}];}
    if(sql.startsWith('SELECT revision'))return[staged.filter(r=>r.source_hash===p[0]&&r.language===p[1])];
    if(sql.startsWith('SELECT source_hash'))return[staged.filter(r=>r.language===p[0])];
    if(sql.startsWith('INSERT INTO language_translations')){staged.push({source_hash:p[0],language:p[1],draft_text:p[2],published_text:null,revision:1});return[{affectedRows:1}];}
    if(sql.includes('SET draft_text=')){const r=staged.find(r=>r.source_hash===p[2]&&r.language===p[3]);r.draft_text=p[0];r.revision++;return[{affectedRows:1}];}
    if(sql.includes('SET published_text=')){const rows=staged.filter(r=>r.language===p[1]);rows.forEach(r=>{r.published_text=r.draft_text||null;r.revision++;});return[{affectedRows:rows.length}];}
    throw new Error('Unexpected transaction query');
  },commit:async()=>{committed++;state=staged;},rollback:async()=>{rolledBack++;},release:()=>{}};
  service.dao={getConnection:async()=>connection,executeQuery:async(sql:string,p:any[])=>{
    if(sql.includes('t.published_text IS NOT NULL'))return{status:1,rows:state.filter(r=>r.language===p[0]&&r.published_text).map(r=>({source_text:sources.find(s=>s.source_hash===r.source_hash)?.source,published_text:r.published_text}))};
    if(sql.startsWith('SELECT source_hash'))return{status:1,rows:state.filter(r=>r.language===p[0])};
    if(sql.includes('LEFT JOIN'))return{status:1,rows:sources.map(s=>{const row=state.find(r=>r.language===p[0]&&r.source_hash===s.source_hash);return{...s,translation:row?.draft_text||'',published_text:row?.published_text,revision:row?.revision||0};})};
    return{status:1,rows:[]};
  }};
  return{service,state:()=>state,counts:()=>({started,committed,rolledBack})};
};
test('custom catalogs restrict languages and validate plain text, normalized sources and placeholders',()=>{
  assert.equal(PUBLIC_LANGUAGES.length,12);for(const code of PUBLIC_LANGUAGES)assert.equal(languageCode(code),code);
  assert.throws(()=>languageCode('fr'));assert.throws(()=>languageCode('en',true));
  assert.equal(sourceHash(' Home\npage '),sourceHash('home page'));
  assert.throws(()=>validateEntry({source:'{count} of {count}',translation:'{count}'}));
  assert.throws(()=>validateEntry({source:'Home',translation:'<script>alert(1)</script>'}));
  assert.throws(()=>validateEntry({source:'Home',translation:123}));assert.throws(()=>validateEntry({source:'x'.repeat(32001),translation:'A'}));
});
test('all languages are available from app-owned data even when the database is unavailable',async()=>{
  const p=prepare();p.service.dao.executeQuery=async()=>({status:-1});
  for(const code of PUBLIC_LANGUAGES){const result=await p.service.catalog({language:code});assert.equal(result.status,1);assert.equal(result.data.custom_catalog_available,false);if(code!=='en')assert(result.data.translations['Buy Now']);}
  assert.equal((await p.service.catalog({language:'fr'})).status,-33);
});
test('content synchronization registers editorial labels without collecting customer data',async()=>{
  const p=prepare();const queries:string[]=[];const sources:string[]=[];
  p.service.dao.executeQuery=async(sql:string,values:any[])=>{
    queries.push(sql);
    if(sql.startsWith('INSERT IGNORE INTO language_sources')){sources.push(values[1]);return{status:1,affectedRows:1};}
    if(sql.startsWith('SELECT DISTINCT title_label'))return{status:1,rows:[{title_label:'Fancy VIP Number'}]};
    return{status:1,rows:[]};
  };
  const result=await p.service.syncContent();assert.equal(result.status,1);assert.deepEqual(sources,['Fancy VIP Number']);
  assert(queries.some(sql=>sql.includes("visibility_type='ONLINE' AND deleted_at IS NULL")));
  assert(queries.every(sql=>!/(?:FROM users|full_name|email|address|phone)/i.test(sql)));
});
test('saving creates drafts; only reviewed publication exposes changes, with version conflict protection',async()=>{
  const p=prepare();assert.equal((await p.service.save({language:'hi',source:'Editorial text',translation:'नया पाठ',revision:0,user_id:1})).status,1);
  assert.equal((await p.service.catalog({language:'hi'})).data.translations['Editorial text'],undefined);
  const version=catalogVersion(p.state());assert.equal((await p.service.publish({language:'hi',version:'stale',confirm:true,user_id:1})).status,-33);
  assert.equal(p.counts().rolledBack,1);assert.equal((await p.service.publish({language:'hi',version,confirm:true,user_id:1})).status,1);
  assert.equal((await p.service.catalog({language:'hi'})).data.translations['Editorial text'],'नया पाठ');
});
test('stale edits roll back and do not overwrite another editor',async()=>{
  const p=prepare();await p.service.save({language:'ml',source:'Home',translation:'ഹോം',revision:0,user_id:1});
  assert.equal((await p.service.save({language:'ml',source:'Home',translation:'മാറ്റം',revision:0,user_id:2})).status,-33);
  assert.equal(p.state()[0].draft_text,'ഹോം');assert.equal(p.counts().rolledBack,1);
});
test('bulk import validates every entry before writing; duplicates, mismatch and missing confirmation reject atomically',async()=>{
  const p=prepare();
  for(const entries of [[{source:'Valid',translation:'मान्य'},{source:'{count} items',translation:'वस्तुएँ'}],[{source:'Home',translation:'होम'},{source:' HOME ',translation:'घर'}]])assert.equal((await p.service.importDrafts({language:'hi',entries,confirm:true,user_id:1})).status,-33);
  assert.equal(p.counts().started,0);assert.equal((await p.service.importDrafts({language:'hi',entries:[{source:'Home',translation:'होम'}],user_id:1})).status,-33);
  assert.equal((await p.service.importDrafts({language:'hi',entries:[{source:'Home',translation:'होम'},{source:'New FAQ',translation:'नया सवाल'}],confirm:true,user_id:1})).status,1);
  assert.equal(p.counts().committed,1);assert.equal(p.state().length,2);assert(p.state().every(r=>r.published_text===null));
});
test('coverage and missing filter include unpublished editorial text; publishing an empty draft removes override',async()=>{
  const p=prepare();await p.service.importDrafts({language:'hi',entries:[{source:'Home',translation:'होम'},{source:'New FAQ',translation:'नया सवाल'}],confirm:true,user_id:1});
  await p.service.publish({language:'hi',version:catalogVersion(p.state()),confirm:true,user_id:1});
  await p.service.save({language:'hi',source:'New FAQ',translation:'',revision:2,user_id:1});
  assert.equal((await p.service.list({language:'hi',page:1,limit:1})).data.summary.drafts,1);
  await p.service.publish({language:'hi',version:catalogVersion(p.state()),confirm:true,user_id:1});
  const result=await p.service.list({language:'hi',missing_only:true,q:'FAQ',page:1,limit:25});assert.equal(result.data.total,1);assert.equal(result.data.summary.missing,1);
  assert.equal((await p.service.catalog({language:'hi'})).data.translations['New FAQ'],undefined);
});
