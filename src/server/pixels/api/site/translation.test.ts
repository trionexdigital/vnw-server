import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Translation, PUBLIC_LANGUAGES, romanizeHindi, validateTranslationInput } from './translation';
const prepare=()=>{
  const service:any=new Translation(),cache=new Map(),requests:any[]=[];
  service.dao={executeQuery:async(sql:string,p:any[])=>{if(sql.startsWith('SELECT'))return {status:1,rows:p.slice(1).filter((h:string)=>cache.has(p[0]+h)).map((h:string)=>({source_hash:h,translated_text:cache.get(p[0]+h)}))};cache.set(p[1]+p[0],p[3]);return {status:1};}};
  service.request=async(url:string,body:any,config:any)=>{requests.push({url,body,config});return {data:{data:{translations:body.q.map((q:string)=>({translatedText:q==='Home'?'होम':'अनुवाद '+q}))}}};};
  return {service,requests};
};
test('translation accepts exactly the 12 approved languages with strict request bounds',()=>{
  assert.equal(PUBLIC_LANGUAGES.length,12);for(const language of PUBLIC_LANGUAGES)assert.equal(validateTranslationInput({language,texts:['Home']}).language,language);
  for(const payload of [{language:'fr',texts:['Home']},{language:'hi',texts:[]},{language:'hi',texts:['x'.repeat(3001)]},{language:'hi',texts:Array(41).fill('Home')},{language:'hi',texts:[123]}])assert.throws(()=>validateTranslationInput(payload));
});
test('backend sends Google key only to provider, caches deduplicated fragments, preserves number tokens',async()=>{
  process.env.GOOGLE_TRANSLATE_API_KEY='test-private-key';const p=prepare();
  const r=await p.service.translate({language:'hi',texts:['Home','Buy 98765 43210 for ₹1,999.50','Home']},'test-cache');
  assert.equal(r.status,1);assert.equal(p.requests.length,1);assert.equal(p.requests[0].body.q.length,2);assert.equal(p.requests[0].config.params.key,'test-private-key');assert(!JSON.stringify(r).includes('test-private-key'));
  assert.match(r.data.translations[1],/98765 43210/);assert.match(r.data.translations[1],/₹1,999.50/);assert.equal(r.data.translations[0],r.data.translations[2]);
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
  assert.equal((await p.service.translate({language:'hi',texts:['Home']},'test-cache')).status,1);assert.equal(p.requests.length,1);
});
test('missing key and provider errors expose a safe retry message',async()=>{
  delete process.env.GOOGLE_TRANSLATE_API_KEY;let p=prepare();assert.match((await p.service.translate({language:'ta',texts:['Home']},'test-missing')).info,/currently unavailable/);
  process.env.GOOGLE_TRANSLATE_API_KEY='secret';p=prepare();p.service.request=async()=>{throw new Error('request https://provider?key=secret');};const r=await p.service.translate({language:'ta',texts:['Home']},'test-error');assert.equal(r.status,-33);assert(!r.info.includes('secret'));delete process.env.GOOGLE_TRANSLATE_API_KEY;
});
test('Hinglish translates through Hindi and romanizes without changing numbers',async()=>{
  process.env.GOOGLE_TRANSLATE_API_KEY='test';const p=prepare();const r=await p.service.translate({language:'hg',texts:['Home','Buy 9876543210']},'test-hinglish');
  assert.equal(r.status,1);assert.equal(p.requests[0].body.target,'hi');assert.equal(r.data.translations[0],'Home');assert(!/[\u0900-\u097f]/.test(r.data.translations[1]));assert.match(r.data.translations[1],/9876543210/);assert.equal(romanizeHindi('नमस्ते'),'namaste');delete process.env.GOOGLE_TRANSLATE_API_KEY;
});
