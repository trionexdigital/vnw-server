import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MarketplaceContent } from './marketplaceContent';
import { DeliveryCities } from './deliveryCities';
import { DealerPurchases } from '../dealerPurchases/dealerPurchases';
import { Cart } from '../cart/cart';

describe('corporate live inventory', () => {
  it('builds complete 100-number series with category filtering and a live total', async () => {
    const service: any = new MarketplaceContent();
    service.prebooks = { reconcile: async () => undefined };
    service.dao = { executeQuery: async (sql: string, params: any[]) => {
      assert.match(sql, /visibility_type='ONLINE'/); assert.match(sql, /EXISTS.*vip_number_categories/); assert.deepEqual(params, ['mirror']);
      return { status: 1, rows: Array.from({ length: 101 }, (_, index) => ({ number_id: index+1, number_value: String(9000000000+index), display_number: String(9000000000+index), offer_price: 100, status: 'AVAILABLE', stock: 1 })) };
    } };
    const response = await service.packs({ size: 100, pack_type: 'SERIES', category_slug: 'mirror' }, true);
    assert.equal(response.status, 1); assert.equal(response.data.length, 1); assert.equal(response.data[0].size, 100); assert.equal(response.data[0].total_price, 10000);
    assert.equal(response.data[0].numbers[99].number_value, '9000000099');
  });
  it('never produces a partial pack or bridges a gap in a series', async () => {
    const service: any = new MarketplaceContent(); service.prebooks = { reconcile: async () => undefined };
    service.dao = { executeQuery: async () => ({ status: 1, rows: Array.from({ length: 20 }, (_, index) => ({ number_id:index+1, number_value:String(9000000000+index*2), offer_price: 100 })) }) };
    const response = await service.packs({ size: 10, pack_type: 'SERIES' }, true);
    assert.equal(response.status, 1); assert.deepEqual(response.data, []);
  });
  it('rejects unsupported bulk sizes before querying inventory', async () => {
    const service: any = new MarketplaceContent(); service.prebooks = { reconcile: async () => undefined };
    service.dao = { executeQuery: async () => { throw new Error('Inventory should not be queried'); } };
    for (const size of [0, 11, 201, 10.5]) {
      const response = await service.packs({ size, pack_type: 'SERIES' }, true);
      assert.equal(response.status, -33); assert.match(response.info, /corporate pack/);
    }
  });
});

describe('bulk pack cart atomicity', () => {
  it('rejects malformed IDs instead of silently adding a partial pack', async () => {
    const service: any = new Cart(); service.prebooks = { reconcile:async()=>undefined };
    service.dao = { getConnection:async()=>{ throw new Error('Must not connect'); } };
    const response = await service.addMany({ user_id:1,number_ids:[1,2,'invalid'] });
    assert.equal(response.status,-33); assert.match(response.info,/invalid number ID/);
  });
  const prepare = (unavailable = false) => {
    const service: any = new Cart(); let inserts = 0; let committed = false; let rolledBack = false;
    const ids = Array.from({ length: 100 }, (_, index) => index + 1);
    service.prebooks = { reconcile: async () => undefined };
    service.list = async () => ({ data: { items: [] } });
    service.dao = { getConnection: async () => ({ beginTransaction: async () => undefined, query: async (sql: string) => {
      if (sql.includes('FROM vip_numbers')) return [ids.map((id) => ({ number_id:id, display_number:String(9000000000+id), status:unavailable && id===50 ? 'SOLD' : 'AVAILABLE', stock:1, rtp_status:'RTP', visibility_type:'ONLINE' }))];
      if (sql.includes('FROM carts')) return [[{ cart_id:1 }]];
      if (sql.includes('cart_items')) { inserts++; return [{}]; }
      throw new Error(sql);
    }, commit: async () => { committed=true; }, rollback: async () => { rolledBack=true; }, release: () => undefined }) };
    return { service, ids, state: () => ({ inserts, committed, rolledBack }) };
  };
  it('adds all 100 selected numbers together', async () => {
    const { service, ids, state } = prepare();
    assert.equal((await service.addMany({ user_id:1, number_ids:ids })).status, 1);
    assert.deepEqual(state(), { inserts:100, committed:true, rolledBack:false });
  });
  it('rolls back the entire bulk pack when even one number is sold', async () => {
    const { service, ids, state } = prepare(true);
    assert.equal((await service.addMany({ user_id:1, number_ids:ids })).status, -33);
    assert.deepEqual(state(), { inserts:0, committed:false, rolledBack:true });
  });
});

describe('delivery-city publishing', () => {
  it('publishes only active cities in configured order', async () => {
    const service: any = new DeliveryCities(); const queries: string[] = [];
    service.dao = { executeQuery: async (sql: string) => { queries.push(sql); return { status:1, rows:[] }; } };
    assert.equal((await service.list()).status, 1); assert.match(queries[0], /WHERE is_active=1/); assert.match(queries[0], /ORDER BY sort_order/);
    await service.list(true); assert.doesNotMatch(queries[1], /WHERE is_active/);
  });
  it('validates required city/state and display order', async () => {
    const service: any = new DeliveryCities(); service.dao = { executeQuery: async () => { throw new Error('Should not query'); } };
    for (const payload of [{ city_name:'', state_name:'Maharashtra' }, { city_name:'Pune', state_name:'' }, { city_name:'Pune', state_name:'Maharashtra', sort_order:-1 }, { city_name:'Pune', state_name:'Maharashtra', city_id:'invalid' }]) {
      const response = await service.save(payload); assert.equal(response.status,-33); assert.doesNotMatch(response.info,/Should not query/);
    }
  });
  it('stores city values through parameters and handles string zero flags', async () => {
    const service: any = new DeliveryCities();
    service.dao = { executeQuery: async (sql: string, params: any[]) => { assert.match(sql,/INSERT INTO delivery_cities/); assert.deepEqual(params,["O'Fallon",'State',null,0,0,3]); return { status:1,insertId:4 }; } };
    const response = await service.save({ city_name:"O'Fallon",state_name:'State',is_active:'0',is_highlighted:'0',sort_order:3 });
    assert.equal(response.status,1); assert.equal(response.data.city_id,4);
  });
});

describe('registered dealer account enforcement', () => {
  it('retires name-only supplier creation', async () => {
    const service: any = new DealerPurchases(); service.dao = { executeQuery: async () => { throw new Error('Must not create supplier'); } };
    const response = await service.createDealer({ name:'Supplier' }); assert.equal(response.status,-33); assert.match(response.info,/Dealer Management/);
  });
  it('lists only actual active dealer users and does not collapse duplicate names', async () => {
    const service: any = new DealerPurchases();
    service.dao = { executeQuery: async (sql: string) => {
      if (sql.startsWith('INSERT')) return { status:1 };
      assert.match(sql,/u.role='DEALER' AND u.status='ACTIVE'/); assert.match(sql,/u.user_id=d.dealer_user_id/);
      return { status:1,rows:[{ external_dealer_id:1,name:'Same',dealer_user_id:4,total_billed:100,total_paid:0 },{ external_dealer_id:2,name:'Same',dealer_user_id:5,total_billed:200,total_paid:100 }] };
    } };
    const response = await service.dealers(); assert.equal(response.status,1); assert.equal(response.data.length,2); assert.deepEqual(response.data.map((row: any)=>row.dealer_user_id),[4,5]);
  });
  it('rejects payments to unlinked or inactive supplier accounts', async () => {
    const service: any = new DealerPurchases(); let rollback = false;
    service.dao = { getConnection: async () => ({ beginTransaction:async()=>undefined, query:async(sql:string)=>{ assert.match(sql,/JOIN auth_user/); return [[]]; },rollback:async()=>{rollback=true;},release:()=>undefined }) };
    const response = await service.recordPayment({ user_id:1,external_dealer_id:2,amount:100 }); assert.equal(response.status,-33); assert.match(response.info,/active dealer account/); assert.equal(rollback,true);
  });
  it('links legacy purchases/payments/events in a transaction without deleting history', async () => {
    const service: any = new DealerPurchases(); const updates: string[] = []; let committed=false;
    service.dao = { getConnection:async()=>({ beginTransaction:async()=>undefined, query:async(sql:string)=>{
      if (sql.includes('FROM auth_user')) return [[{ user_id:4 }]];
      if (sql.includes('dealer_user_id IS NULL')) return [[{ external_dealer_id:2 }]];
      if (sql.startsWith('SELECT external_dealer_id')) return [[{ external_dealer_id:3 }]];
      updates.push(sql); return [{}];
    },commit:async()=>{committed=true;},rollback:async()=>undefined,release:()=>undefined }) };
    const response = await service.linkDealerAccount({ user_id:1,external_dealer_id:2,dealer_user_id:4 });
    assert.equal(response.status,1); assert.equal(committed,true); assert.equal(updates.filter((sql)=>sql.startsWith('UPDATE dealer_purchase_')).length,3); assert.equal(updates.some((sql)=>/DELETE/.test(sql)),false);
  });
});
