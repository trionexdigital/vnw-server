import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { LocationPincode } from './locationPincode';

test('GPS lookup uses a shared atomic throttle, hashed cache, attribution identity and bounded upstream calls', async t => {
    const original = axios.get;
    t.after(() => { axios.get = original; });
    let now = 0, nextAllowed = 0, upstreamCalls = 0;
    const cache = new Map<string,string|null>();
    (axios as any).get = async (url:string, options:any) => {
        upstreamCalls++;
        assert.match(url,/\/reverse$/); assert.match(options.headers['User-Agent'],/VIPNumberWorld/);
        assert.equal(options.params.lat,'19.0761'); assert.equal(options.timeout,8000);
        return {data:{address:{country_code:'in',postcode:'400001'}}};
    };
    const dao = {executeQuery:async(sql:string,params:any[])=>{
        if(sql.startsWith('SELECT')) return {status:1,rows:cache.has(params[0])?[{pin_code:cache.get(params[0])}]:[]};
        if(sql.startsWith('UPDATE')) { const allowed=now>=nextAllowed; if(allowed)nextAllowed=now+1100; return {status:1,affectedRows:allowed?1:0}; }
        if(sql.startsWith('INSERT INTO location_geocode_cache')) { assert.match(params[0],/^[a-f0-9]{64}$/); cache.set(params[0],params[1]); }
        return {status:1};
    }};
    const a=new LocationPincode(),b=new LocationPincode(); (a as any).dao=dao;(b as any).dao=dao;
    const responses: any[]=await Promise.all([a.lookup({latitude:19.076123,longitude:72.8777}),b.lookup({latitude:19.0761,longitude:73})]);
    assert.equal(upstreamCalls,1);
    assert.equal(responses[0].data.pin_code,'400001');assert.equal(responses[1].data.reason,'BUSY');
    assert.equal((await a.lookup({latitude:19.076123,longitude:72.8777})).data.pin_code,'400001'); assert.equal(upstreamCalls,1);
    now=1100;
    await b.lookup({latitude:19.0761,longitude:73}); assert.equal(upstreamCalls,2);
});

test('an unseeded throttle row is repaired before the atomic request reservation',async t=>{
    const original=axios.get;t.after(()=>{axios.get=original;});
    (axios as any).get=async()=>({data:{address:{country_code:'in',postcode:'400070'}}});
    const service=new LocationPincode();let seeded=false,requested=false;
    (service as any).dao={executeQuery:async(sql:string)=>{
        if(sql.startsWith('SELECT'))return {status:1,rows:[]};
        if(sql.startsWith('INSERT IGNORE')) { seeded=true;return {status:1}; }
        if(sql.startsWith('UPDATE')) { assert.ok(seeded);requested=true;return {status:1,affectedRows:1}; }
        return {status:1};
    }};
    assert.equal((await service.lookup({latitude:19.0761,longitude:72.8777})).data.pin_code,'400070');
    assert.ok(requested);
});

test('a malformed provider response is unavailable and never cached as a missing postcode',async t=>{
    const original=axios.get;t.after(()=>{axios.get=original;});
    (axios as any).get=async()=>({data:{error:'Provider temporarily unavailable'}});
    const service=new LocationPincode();let cached=false;
    (service as any).logger={error:()=>{}};
    (service as any).dao={executeQuery:async(sql:string)=>{
        if(sql.startsWith('INSERT INTO location_geocode_cache'))cached=true;
        return {status:1,rows:[],affectedRows:1};
    }};
    assert.deepEqual((await service.lookup({latitude:19.0761,longitude:72.8777})).data,{pin_code:null,reason:'UNAVAILABLE'});
    assert.equal(cached,false);
});

test('invalid coordinates, foreign or missing PINs and upstream failure are recoverable', async t=>{
    const original=axios.get;t.after(()=>{axios.get=original;});
    const service=new LocationPincode();
    (service as any).dao={executeQuery:async(sql:string)=>({status:1,rows:[],affectedRows:1})};
    assert.equal((await service.lookup({latitude:91,longitude:0})).data.reason,'INVALID_COORDINATES');
    assert.equal((await service.lookup({latitude:'19',longitude:0})).data.reason,'INVALID_COORDINATES');
    for(const address of [{country_code:'us',postcode:'400001'},{country_code:'in'},{country_code:'in',postcode:'000001'}]) {
        (axios as any).get=async()=>({data:{address}});
        assert.equal((await service.lookup({latitude:19,longitude:72})).data.reason,'NO_INDIAN_PIN');
    }
    (axios as any).get=async()=>{throw new Error('Do not log GPS request');};
    const response:any=await service.lookup({latitude:19,longitude:72});
    assert.equal(response.status,1); assert.deepEqual(response.data,{pin_code:null,reason:'UNAVAILABLE'});
});
