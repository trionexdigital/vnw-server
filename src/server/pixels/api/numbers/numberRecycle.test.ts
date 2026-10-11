import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyseDeleteNumbers, NumberRecycle, parseDeleteNumbers } from './numberRecycle';
const row = { number_id:1,number_value:'9876543210',display_number:'98765 43210',status:'AVAILABLE',stock:1,deleted_at:null,updated_at:'2026-10-12',active_prebook:0 };
const prepare = (rows:any[]) => {
  const service:any=new NumberRecycle(), calls:{sql:string;params:any[]}[]=[];let committed=false,rolledBack=false;
  service.dao={getConnection:async()=>({beginTransaction:async()=>{},query:async(sql:string,params:any[])=>{calls.push({sql,params});return sql.startsWith('SELECT')?[rows]:[{affectedRows:1}];},commit:async()=>{committed=true;},rollback:async()=>{rolledBack=true;},release:()=>{}})};
  return {service,calls,state:()=>({committed,rolledBack})};
};
test('strict deletion parser canonicalizes formatted numbers and reports invalids and duplicates',()=>{
  const p=parseDeleteNumbers('98765 43210,+91 9876543210\nabc9876543210\n123\n9988776655');
  assert.deepEqual(p.valid,['9876543210','9988776655']);assert.deepEqual(p.duplicates,['9876543210']);assert.equal(p.invalid.length,2);
  assert.throws(()=>parseDeleteNumbers(''));assert.throws(()=>parseDeleteNumbers(Array(2).fill('9876543210')));assert.throws(()=>parseDeleteNumbers(Array(1001).fill('9876543210').join(',')));
});
test('validation separates eligible, absent, recycled, reserved and active pre-book numbers',()=>{
  const p=parseDeleteNumbers('9876543210,9988776655,9000000001,9000000002,9000000003,invalid');
  const a=analyseDeleteNumbers(p,[row,{...row,number_id:2,number_value:'9000000001',deleted_at:'2026-10-11'},{...row,number_id:3,number_value:'9000000002',status:'RESERVED'},{...row,number_id:4,number_value:'9000000003',active_prebook:1}],7);
  assert.equal(a.eligible.length,1);assert.equal(a.blocked.length,2);assert.deepEqual(a.not_found,['9988776655']);assert.equal(a.already_deleted.length,1);assert.equal(a.invalid.length,1);
});
test('confirmed soft delete locks, audits and snapshots stock/status without physically deleting inventory',async()=>{
  const p=prepare([row]);const token=analyseDeleteNumbers(parseDeleteNumbers(row.number_value),[row],7).validation_token;
  const r=await p.service.softDelete({numbers:row.number_value,user_id:7,validation_token:token,confirm:true});
  assert.equal(r.status,1);assert.deepEqual(p.state(),{committed:true,rolledBack:false});assert.match(p.calls[0].sql,/FOR UPDATE/);
  assert(p.calls.some(c=>c.sql.includes('status_before_delete=status,stock_before_delete=stock')));assert(p.calls.some(c=>c.sql.includes('number_recycle_events')&&c.params[2]==='RECYCLED'));
  assert(!p.calls.some(c=>c.sql.startsWith('DELETE FROM vip_numbers')));
});
test('stale validation and missing confirmation reject without changes',async()=>{
  const p=prepare([{...row,status:'RESERVED'}]);const token=analyseDeleteNumbers(parseDeleteNumbers(row.number_value),[row],7).validation_token;
  assert.match((await p.service.softDelete({numbers:row.number_value,user_id:7,validation_token:token,confirm:true})).info,/changed since validation/);
  assert.deepEqual(p.state(),{committed:false,rolledBack:true});assert.equal(p.calls.length,1);
  assert.match((await p.service.softDelete({numbers:row.number_value,user_id:7})).info,/confirm/);
});
test('restore recovers previous stock/status and rejects active or missing inventory',async()=>{
  const p=prepare([{...row,deleted_at:'2026-10-12',status_before_delete:'SOLD',stock_before_delete:0}]);
  assert.equal((await p.service.change({number_ids:[1],user_id:7})).status,1);assert(p.calls.some(c=>c.sql.includes("status=COALESCE(status_before_delete,'INACTIVE'),stock=COALESCE(stock_before_delete,0)")));
  const active=prepare([row]);assert.match((await active.service.change({number_ids:[1],user_id:7})).info,/only recycled/);assert.equal(active.calls.length,1);
});
test('permanent deletion is confined to confirmed recycled inventory without purchase history',async()=>{
  const p=prepare([{...row,deleted_at:'2026-10-12',has_history:1}]);
  assert.match((await p.service.change({number_ids:[1],user_id:7,confirm:true},true)).info,/history/);assert.equal(p.calls.length,1);
  const clean=prepare([{...row,deleted_at:'2026-10-12',has_history:0}]);assert.equal((await clean.service.change({number_ids:[1],user_id:7,confirm:true},true)).status,1);
  assert(clean.calls.some(c=>c.sql==='DELETE FROM vip_numbers WHERE number_id=? AND deleted_at IS NOT NULL'));assert(clean.calls.some(c=>c.params[2]==='PERMANENTLY_DELETED'));
  const unconfirmed=prepare([]);assert.match((await unconfirmed.service.change({number_ids:[1],user_id:7},true)).info,/Confirm/);assert.equal(unconfirmed.calls.length,0);
});
test('recycle pagination bounds pages and exposes history protection',async()=>{
  const service:any=new NumberRecycle();const calls:any[]=[];
  service.dao={executeQuery:async(sql:string,params:any[])=>{calls.push({sql,params});return {status:1,rows:sql.includes('COUNT(*)')?[{total:150}]:[{...row,deleted_at:'2026-10-12',has_history:1}]};}};
  const r=await service.list({page:2,limit:2000,q:'987'});assert.equal(r.status,1);assert.equal(r.data.limit,1000);assert.equal(r.data.total,150);assert.equal(r.data.items[0].can_permanently_delete,false);assert.deepEqual(calls[1].params,['%987%',1000,1000]);assert.match(calls[1].sql,/deleted_at IS NOT NULL/);
});
