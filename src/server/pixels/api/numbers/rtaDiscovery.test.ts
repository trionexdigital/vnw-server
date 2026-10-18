import assert from 'node:assert/strict';
import test from 'node:test';
import { Numbers } from './numbers';
import { normalizeServiceablePins, rtaDiscoveryPredicate } from './serviceablePins';
import { NumberImport, readNumberRows, validateImportRow } from '../admin/numberImport';

test('PIN validation rejects malformed service areas and deduplicates exact PINs', () => {
    assert.deepEqual(normalizeServiceablePins('400001;400002\n400001', true), ['400001', '400002']);
    for (const value of ['', '000001', '12345', '1234567', '40000x', ['400001', '']]) assert.throws(() => normalizeServiceablePins(value, true));
    assert.deepEqual(normalizeServiceablePins(undefined), []);
    assert.match(validateImportRow({ number: '9876543210', mrp: 100, rtp_status: 'RTA' }).reasons.join(), /require/);
    assert.equal(validateImportRow({ number_id: 1, number: '9876543210', mrp: 100, rtp_status: 'RTA' }).reasons.length, 0);
});

test('RTA defaults never broaden missing or unmatched PINs', () => {
    assert.deepEqual(rtaDiscoveryPredicate({}).where, ["n.rtp_status <> 'RTA'"]);
    assert.deepEqual(rtaDiscoveryPredicate({ rtp_status: 'RTA' }).where, ['1=0']);
    assert.deepEqual(rtaDiscoveryPredicate({ rtp_status: 'RTA', show_all_rta: 'true' }).where, ['1=0']);
    assert.deepEqual(rtaDiscoveryPredicate({ rtp_status: 'RTA', show_all_rta: true }).where, []);
    assert.throws(() => rtaDiscoveryPredicate({ rtp_status: 'RTA', pin_code: '400001 OR 1=1' }));
});

function service() {
    const numbers = new Numbers();
    const calls: Array<{ sql: string; params: any[] }> = [];
    (numbers as any).prebooks = { reconcile: async () => undefined };
    (numbers as any).dao = { executeQuery: async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [] };
    } };
    return { numbers, calls };
}

test('RTA count and page queries apply the same bound PIN, search, price and visibility filters', async () => {
    const { numbers, calls } = service();
    const response: any = await numbers.list({rtp_status:'RTA',pin_code:'400001',page:2,limit:7,price_max:5000,search:{ends_with:'786'}});
    assert.equal(response.status, 1);
    assert.equal(response.data.page, 2);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.match(call.sql, /sp.pin_code=\?/);
        assert.match(call.sql, /visibility_type = 'ONLINE'/);
        assert.match(call.sql, /stock > 0/);
        assert.ok(call.params.includes('400001')); assert.ok(call.params.includes('RTA'));
        assert.ok(call.params.includes('%786')); assert.ok(call.params.includes(5000));
        assert.doesNotMatch(call.sql, /400001/);
    }
    assert.deepEqual(calls[1].params.slice(-2), [7, 7]);
});

test('public requests cannot elevate inventory scope or expose RTA through featured feeds', async () => {
    const { numbers, calls } = service();
    await numbers.list({admin_scope:true,status:'ALL',show_all_rta:true});
    assert.match(calls[0].sql, /rtp_status <> 'RTA'/);
    assert.match(calls[0].sql, /visibility_type = 'ONLINE'/);
    assert.ok(calls[0].params.includes('AVAILABLE'));
    calls.length = 0;
    await numbers.featured({rtp_status:'RTA',show_all_rta:true});
    assert.match(calls[0].sql, /rtp_status <> 'RTA'/);
});

test('AI and all relaxed alternatives retain the RTA location boundary', async () => {
    const { numbers, calls } = service();
    (numbers as any).openAiFilters = async () => ({filters:{},explanation:'Test'});
    const result: any = await numbers.aiSearch({query:'ending 786',rtp_status:'RTA',pin_code:'400001',search:{ends_with:'786',include_alternatives:true},include_alternatives:true});
    assert.equal(result.status, 1);
    assert.ok(calls.length >= 4);
    for (const call of calls) { assert.match(call.sql,/sp.pin_code=\?/); assert.ok(call.params.includes('400001')); assert.ok(call.params.includes('RTA')); }
});

test('RTA service areas survive an exported workbook and re-import validation', async () => {
    const importer = new NumberImport();
    const file = await importer.export({}, async () => ({status:1,data:{items:[{number_value:'9876543210',mrp:100,rtp_status:'RTA',serviceable_pin_codes:['400001','400002']}],total:1}}));
    const rows = readNumberRows({}, {name:file.filename,data:Buffer.from(file.content_base64,'base64')});
    const result = validateImportRow(rows[0]);
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(result.values.serviceable_pin_codes, ['400001','400002']);
});

test('a PIN assignment failure rolls back the inventory creation', async () => {
    const { numbers } = service(); let rolledBack = false, committed = false;
    (numbers as any).dao = {getConnection: async () => ({beginTransaction:async()=>{},release:()=>{},rollback:async()=>{rolledBack=true;},commit:async()=>{committed=true;},query:async(sql:string)=>{
        if(sql.includes('INSERT INTO vip_numbers'))return [{insertId:1}];
        if(sql.includes('vip_number_serviceable_pins'))throw new Error('PIN write failed');
        return [[{value:'0'}]];
    }})};
    const response: any = await numbers.create({number_value:'9876543210',mrp:100,seller_id:1,rtp_status:'RTA',serviceable_pin_codes:['400001']});
    assert.equal(response.status,-33); assert.ok(rolledBack); assert.equal(committed,false);
});

test('authorized inventory reads return complete PIN arrays without aggregate truncation', async()=>{
    const {numbers}=service();
    const pins=Array.from({length:500},(_,i)=>String(100001+i));
    const queries:string[]=[];
    (numbers as any).dao={executeQuery:async(sql:string)=>{
        queries.push(sql);
        return {status:1,rows:sql.includes('COUNT(*)')?[{total:1}]:sql.includes('SELECT number_id,pin_code')?pins.map(pin_code=>({number_id:1,pin_code})):[{number_id:1,number_value:'9876543210',rtp_status:'RTA'}]};
    }};
    const result:any=await numbers.list({seller_id:4,status:'ALL'},true);
    assert.equal(result.status,1);
    assert.deepEqual(result.data.items[0].serviceable_pin_codes,pins);
    assert.match(queries[0],/seller_id = \?/);
    assert.doesNotMatch(queries.join('\n'),/GROUP_CONCAT/);
});

test('legacy RTA edits preserve unassigned service areas; explicit empty updates fail atomically', async()=>{
    for(const explicit of [false,true]){
        const {numbers}=service();let rolledBack=false,committed=false;
        const statements:string[]=[];
        (numbers as any).dao={getConnection:async()=>({beginTransaction:async()=>{},release:()=>{},rollback:async()=>{rolledBack=true;},commit:async()=>{committed=true;},query:async(sql:string)=>{
            statements.push(sql);
            if(sql.includes('FROM vip_numbers'))return [[{number_value:'9876543210',display_number:'9876543210',rtp_status:'RTA',status:'AVAILABLE'}]];
            return [{affectedRows:1}];
        }})};
        const result:any=await numbers.update({number_id:1,title_label:'Updated title',...(explicit?{serviceable_pin_codes:[]}: {})});
        assert.equal(result.status,explicit?-33:1);
        assert.equal(committed,!explicit);assert.equal(rolledBack,explicit);
        assert.equal(statements.some(sql=>sql.includes('vip_number_serviceable_pins')),false);
    }
});
