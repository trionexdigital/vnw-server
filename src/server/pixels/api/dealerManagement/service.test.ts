import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { DealerManagement } from './service';
import { DM_PERMISSIONS } from './domain';

// Real relational SQL/transactions in Node's in-memory SQLite. This exercises the
// service, not a mock implementation. MySQL deployment/locking must also be checked
// using the manual migration guide; the dialect adapter is intentionally test-only.
function fixture() {
  const {
    DatabaseSync
  } = require('node:sqlite');
  const database = new DatabaseSync(':memory:');
  database.function('UTC_TIMESTAMP', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
  database.function('IF', (condition: any, a: any, b: any) => condition ? a : b);
  database.function('DATE_FORMAT', (value: any, _format: any) => value ? String(value).slice(0, 10) : null);
  database.exec("PRAGMA foreign_keys=ON; CREATE TABLE auth_user(user_id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,phone TEXT UNIQUE,password TEXT,full_name TEXT,role TEXT,status TEXT,referral_code TEXT); INSERT INTO auth_user VALUES (1,'admin@example.test','9000000001','hash','Admin','ADMIN','ACTIVE',NULL),(2,'staff@example.test','9000000002','hash','Staff','EMPLOYEE','ACTIVE',NULL),(3,'a@example.test','9000000003','hash','Dealer A','USER','ACTIVE',NULL),(4,'b@example.test','9000000004','hash','Dealer B','USER','ACTIVE',NULL);");
  // Sentinel website tables deliberately use unrelated contents and remain unchanged.
  database.exec("CREATE TABLE vip_numbers(id INTEGER,price TEXT); INSERT INTO vip_numbers VALUES (1,'999.00'); CREATE TABLE orders(id INTEGER,total TEXT); INSERT INTO orders VALUES (1,'999.00'); CREATE TABLE wallets(id INTEGER,balance TEXT); INSERT INTO wallets VALUES (3,'123.45'); CREATE TABLE dealer_purchase_numbers(id INTEGER); INSERT INTO dealer_purchase_numbers VALUES(9);");
  const migration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261020_standalone_dealer_management.sql'), 'utf8');
  const translate = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\b(?:int|bigint) unsigned AUTO_INCREMENT PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT').replace(/\b(?:int|bigint|tinyint) unsigned/gi, 'INTEGER').replace(/enum\([^)]*\)/gi, 'TEXT').replace(/decimal\(\d+,\d+\)/gi, 'TEXT').replace(/,\s*(?:UNIQUE )?KEY \w+\([^)]*\)/g, '').replace(/\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/g, ')').replace(/INSERT IGNORE/g, 'INSERT OR IGNORE');
  const sqliteMigration = translate(migration).replace(/active_number\(active_number\)/g, 'active_number');
  database.exec(sqliteMigration);
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS dm_active_number_test ON dm_stock(active_number)');
  database.exec(sqliteMigration); // Rerun new-table migration with existing records.
  let tail = Promise.resolve();
  let waiting = 0;
  const queries: string[] = [];
  const dao = {
    getConnection: async () => {
      let unlock: (() => void) | undefined;
      return {
        beginTransaction: async () => {
          const previous = tail;
          tail = new Promise<void>(resolve => {
            unlock = resolve;
          });
          waiting++;
          await previous;
          database.exec('BEGIN');
        },
        commit: async () => {
          database.exec('COMMIT');
          waiting--;
          unlock?.();
          unlock = undefined;
        },
        rollback: async () => {
          database.exec('ROLLBACK');
          waiting--;
          unlock?.();
          unlock = undefined;
        },
        release: () => {},
        query: async (sql: string, args: any[] = []) => {
          queries.push(sql);
          let statement = sql.replace(/ FOR UPDATE/g, '');
          const having = statement.includes('HAVING remaining>0');
          statement = statement.replace(' HAVING remaining>0', '');
          const bound = args.map(v => v === undefined ? null : v);
          const prepared = database.prepare(statement);
          if (/^\s*SELECT/i.test(statement)) {
            let rows = prepared.all(...bound);
            if (having) rows = rows.filter((r: any) => Number(r.remaining) > 0);
            return [rows];
          }
          const result = prepared.run(...bound);
          return [{
            insertId: Number(result.lastInsertRowid),
            affectedRows: Number(result.changes)
          }];
        }
      };
    }
  };
  const service = new DealerManagement(dao);
  let serial = 0;
  const run = (action: string, p: any = {}, user = 1) => service.execute(user, action, {
    ...p,
    request_key: p.request_key || `test-operation-${String(++serial).padStart(8, '0')}`
  });
  const createDealer = async (link = 3) => run('dealerSave', {
    dealer_type: 'BASIC',
    name: 'Supplier ' + link,
    contact_name: 'Contact',
    phone: '900000000' + link,
    email: `dealer${link}@example.test`,
    status: 'ACTIVE',
    linked_user_id: link
  });
  const stock = async (dealerId: number, number = '8008009307', cost = '15000') => run('stockAdd', {
    rows: [{
      dealer_id: dealerId,
      number_value: number,
      dealer_cost: cost,
      selling_price: '22000',
      readiness: 'RTP'
    }]
  });
  const sale = async (stockId: number, overrides: any = {}) => {
    const row = database.prepare('SELECT * FROM dm_stock WHERE stock_id=?').get(stockId);
    return run('sell', {
      stock_id: stockId,
      version: row.version,
      sale_price: '22000',
      charges: '500',
      sale_source: 'OFFLINE',
      sold_at: '2026-10-20T10:00',
      ...overrides
    });
  };
  const pay = async (dealerId: number, saleIds: number[], overrides: any = {}) => {
    const preview = await run('paymentPreview', {
      dealer_id: dealerId,
      sale_ids: saleIds
    });
    return run('paymentRecord', {
      dealer_id: dealerId,
      sale_ids: saleIds,
      gross_amount: preview.gross_amount,
      recovery_amount: preview.recovery_amount,
      net_amount: preview.net_amount,
      payment_mode: 'BANK',
      reference_no: 'UTR-123',
      paid_at: '2026-10-20T12:00',
      ...overrides
    });
  };
  const baseline = () => ['vip_numbers', 'orders', 'wallets', 'dealer_purchase_numbers'].map(table => database.prepare(`SELECT * FROM ${table}`).all());
  return {
    service,
    run,
    createDealer,
    stock,
    sale,
    pay,
    database,
    queries,
    baseline,
    waiting: () => waiting
  };
}
describe('standalone dealer SQL service', () => {
  it('starts fresh, reruns migration, generates codes and does not mutate website records', async () => {
    const f = fixture();
    const before = f.baseline();
    const a = await f.createDealer();
    const b = await f.run('dealerSave', {
      dealer_type: 'PREMIUM',
      name: 'Premium',
      contact_name: 'Contact',
      phone: '9000000010',
      email: 'premium@example.test',
      status: 'ACTIVE'
    });
    assert.equal(a.dealer_code, 'VNW-B001');
    assert.equal(b.dealer_code, 'VNW-P001');
    const s = await f.stock(a.dealer_id);
    const sale = await f.sale(s.stock_ids[0]);
    assert.equal(sale.profit, '6500.00');
    const paid = await f.pay(a.dealer_id, [sale.sale_id]);
    assert.equal(paid.payment_code, 'VNW-PAY-000001');
    assert.deepEqual(f.baseline(), before);
    assert.equal(f.database.prepare('SELECT role FROM auth_user WHERE user_id=3').get().role, 'USER');
    assert.ok(f.queries.filter(q => /^(INSERT|UPDATE|DELETE)/.test(q)).every(q => /^(INSERT INTO|UPDATE|DELETE FROM) dm_/.test(q)));
  });
  it('creates a customer login atomically and preserves existing account roles', async () => {
    const f = fixture();
    await f.run('dealerSave', {
      dealer_type: 'BASIC',
      name: 'New dealer',
      contact_name: 'New contact',
      phone: '9000000011',
      email: 'new@example.test',
      status: 'ACTIVE',
      create_account: true,
      password: 'safe-test-password'
    });
    const user = f.database.prepare('SELECT * FROM auth_user WHERE email=?').get('new@example.test');
    assert.equal(user.role, 'USER');
    assert.notEqual(user.password, 'safe-test-password');
    assert.equal(f.database.prepare('SELECT linked_user_id FROM dm_dealers').get().linked_user_id, user.user_id);
    await assert.rejects(() => f.createDealer(Number(user.user_id)), /UNIQUE|constraint/);
  });
  it('denies wildcard employees and cross-dealer access; blocks linked statement access', async () => {
    const f = fixture();
    const a = await f.createDealer();
    await assert.rejects(() => f.run('dealers', {}, 2), /Forbidden/);
    await f.run('staffSave', {
      target_id: 2,
      permissions: ['dealers.view'],
      reason: 'Grant dealer viewing'
    });
    assert.equal((await f.run('dealers', {}, 2)).items.length, 1);
    await assert.rejects(() => f.stock(a.dealer_id).then(() => f.run('paymentRecord', {}, 2)), /Forbidden/);
    await assert.rejects(() => f.run('statement', {}, 4), /No active/);
    const row = f.database.prepare('SELECT * FROM dm_dealers').get();
    await f.run('dealerSave', {
      ...row,
      status: 'BLOCKED',
      reason: 'Dealer requested block'
    });
    await assert.rejects(() => f.run('statement', {}, 3), /No active/);
    await assert.rejects(() => f.stock(a.dealer_id, '8008005413'), /blocked/);
  });
  it('locks sale snapshots despite stock price updates and restricts sold identity edits', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const stock = await f.stock(a.dealer_id);
    const sale = await f.sale(stock.stock_ids[0]);
    let row = f.database.prepare('SELECT * FROM dm_stock').get();
    await f.run('stockSave', {
      stock_id: row.stock_id,
      version: row.version,
      dealer_cost: '18000',
      reason: 'Updated next stock price'
    });
    assert.equal(String(f.database.prepare('SELECT dealer_cost FROM dm_sales').get().dealer_cost), '15000.00');
    row = f.database.prepare('SELECT * FROM dm_stock').get();
    await assert.rejects(() => f.run('stockSave', {
      stock_id: row.stock_id,
      version: row.version,
      number_value: '8008005413',
      reason: 'Change sold identity'
    }), /adjustment/);
    const summary = await f.run('summary', {
      dealer_id: a.dealer_id
    });
    assert.equal(Number(summary.pending), 15000);
    assert.equal(Number(summary.profit), 6500);
    const statement = await f.run('statement', {
      dealer_id: 999999
    }, 3);
    assert.equal(statement.items[0].sale_id, sale.sale_id);
    const serialized = JSON.stringify(statement);
    for (const field of ['sale_price', 'selling_price', 'commission', 'profit', 'charges', 'customer', 'email', 'external_reference']) assert.ok(!serialized.includes('"' + field + '"'), field);
  });
  it('handles idempotent requests, concurrent settlement and stale previews', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const s = await f.stock(a.dealer_id);
    const sale = await f.sale(s.stock_ids[0]);
    const preview = await f.run('paymentPreview', {
      dealer_id: a.dealer_id,
      sale_ids: [sale.sale_id]
    });
    const p = {
      dealer_id: a.dealer_id,
      sale_ids: [sale.sale_id],
      gross_amount: preview.gross_amount,
      recovery_amount: preview.recovery_amount,
      net_amount: preview.net_amount,
      payment_mode: 'CASH',
      paid_at: '2026-10-20T12:00',
      request_key: 'same-payment-request-0001'
    };
    const [first, second] = await Promise.all([f.run('paymentRecord', p), f.run('paymentRecord', p)]);
    assert.equal(first.payment_id, second.payment_id);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM dm_payments').get().n, 1);
    await assert.rejects(() => f.run('paymentRecord', {
      ...p,
      request_key: 'different-payment-request'
    }), /paid/);
    await assert.rejects(() => f.run('paymentRecord', {
      ...p,
      reference_no: 'Changed request'
    }), /different operation/);
    assert.equal(f.waiting(), 0);
  });
  it('reverses unpaid payables and carries paid cancellation recoveries into full allocations', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const s1 = await f.stock(a.dealer_id);
    const sale1 = await f.sale(s1.stock_ids[0]);
    const payment1 = await f.pay(a.dealer_id, [sale1.sale_id]);
    let row = f.database.prepare('SELECT * FROM dm_sales WHERE sale_id=?').get(sale1.sale_id);
    await f.run('saleCancel', {
      sale_id: row.sale_id,
      version: row.version,
      reason: 'Customer refund confirmed'
    });
    assert.equal(Number((await f.run('summary', {
      dealer_id: a.dealer_id
    })).recovery_outstanding), 15000);
    const s2 = await f.stock(a.dealer_id, '8008005413', '10000');
    const sale2 = await f.sale(s2.stock_ids[0]);
    const payment2 = await f.pay(a.dealer_id, [sale2.sale_id]);
    const receipt = await f.run('receipt', {
      payment_id: payment2.payment_id
    });
    assert.equal(Number(receipt.payment.gross_amount), 10000);
    assert.equal(Number(receipt.payment.recovery_amount), 10000);
    assert.equal(Number(receipt.payment.net_amount), 0);
    assert.equal(Number(receipt.numbers[0].amount), 10000);
    const balance = await f.run('summary', { dealer_id: a.dealer_id });
    assert.equal(Number(balance.recovery_outstanding), 5000);
    assert.equal(Number(balance.paid), 15000); // Net cash remains paid despite a zero-cash recovery settlement.
    assert.equal(Number(balance.cleared_amount), 10000);
    assert.equal(Number((await f.run('summary')).recovery_outstanding), 5000);
    await assert.rejects(() => f.run('paymentVoid', {
      payment_id: payment1.payment_id,
      reason: 'Reverse original payment'
    }), /later recovery/);
    await f.run('paymentVoid', {
      payment_id: payment2.payment_id,
      reason: 'Reverse later settlement'
    });
    await f.run('paymentVoid', {
      payment_id: payment1.payment_id,
      reason: 'Reverse original settlement'
    });
    assert.equal(Number((await f.run('summary', {
      dealer_id: a.dealer_id
    })).recovery_outstanding), 0);
    row = f.database.prepare('SELECT * FROM dm_sales WHERE sale_id=?').get(sale2.sale_id);
    await f.run('saleCancel', {
      sale_id: row.sale_id,
      version: row.version,
      reason: 'Cancel unpaid sale'
    });
    assert.equal(Number((await f.run('summary', {
      dealer_id: a.dealer_id
    })).pending), 0);
  });
  it('corrects a paid sale with immutable replacement and audited financial impact', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const s = await f.stock(a.dealer_id);
    const sale = await f.sale(s.stock_ids[0]);
    await f.pay(a.dealer_id, [sale.sale_id]);
    const row = f.database.prepare('SELECT * FROM dm_sales').get();
    const p = {
      sale_id: row.sale_id,
      version: row.version,
      dealer_cost: '18000',
      sale_price: '22000',
      charges: '500',
      reason: 'Correct signed dealer cost',
      confirm_impact: true
    };
    const preview = await f.run('salePreview', p);
    assert.equal(preview.payable_change, '3000.00');
    assert.equal(preview.profit_change, '-3000.00');
    await f.run('saleCorrect', p);
    const rows = f.database.prepare('SELECT * FROM dm_sales ORDER BY sale_id').all();
    assert.equal(rows[0].status, 'CANCELLED');
    assert.equal(rows[0].dealer_cost, '15000.00');
    assert.equal(rows[1].dealer_cost, '18000.00');
    assert.equal(rows[1].replaces_sale_id, rows[0].sale_id);
    assert.ok(f.database.prepare("SELECT COUNT(*) n FROM dm_audit WHERE entity_type='SALE'").get().n >= 3);
  });
  it('validates CSV/XLSX, revalidates commit, exports original inputs and rolls back failed batches', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const sheet = XLSX.utils.json_to_sheet([{
      number_value: '8008009307',
      dealer_cost: '15000',
      selling_price: '22000',
      readiness: 'RTP',
      remarks: 'source note'
    }]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Numbers');
    const content_base64 = XLSX.write(book, {
      type: 'base64',
      bookType: 'xlsx'
    });
    const preview = await f.run('importPreview', {
      dealer_id: a.dealer_id,
      content_base64
    });
    assert.equal(preview.ready, 1);
    await f.run('importCommit', {
      rows: preview.rows.map((r: any) => r.values)
    });
    await assert.rejects(() => f.run('importCommit', {
      rows: preview.rows.map((r: any) => r.values)
    }), /UNIQUE/);
    const exported = await f.run('export', {
      dealer_id: a.dealer_id
    });
    const exportedBook = XLSX.read(exported.content_base64, {
      type: 'base64'
    });
    const row: any = XLSX.utils.sheet_to_json(exportedBook.Sheets[exportedBook.SheetNames[0]])[0];
    assert.equal(row.dealer_cost, '15000.00');
    assert.equal(row.number_value, '8008009307');
    const csv = Buffer.from('number_value,dealer_cost,selling_price,readiness\n8008005413,10,20,RTP\ninvalid,1,2,RTP').toString('base64');
    const invalid = await f.run('importPreview', {
      dealer_id: a.dealer_id,
      content_base64: csv
    });
    assert.equal(invalid.ready, 1);
    assert.equal(invalid.total, 2);
    await assert.rejects(() => f.run('stockAdd', {
      rows: [{
        dealer_id: a.dealer_id,
        number_value: '8008005413',
        dealer_cost: '10',
        selling_price: '20',
        readiness: 'RTP'
      }, {
        dealer_id: a.dealer_id,
        number_value: 'invalid',
        dealer_cost: '10',
        selling_price: '20',
        readiness: 'RTP'
      }]
    }));
    assert.equal(f.database.prepare('SELECT COUNT(*) n FROM dm_stock').get().n, 1);
  });
  it('rolls back bulk changes on stale versions and requires explicit loss confirmation', async () => {
    const f = fixture();
    const a = await f.createDealer();
    await f.stock(a.dealer_id);
    await f.stock(a.dealer_id, '8008005413');
    const rows = f.database.prepare('SELECT * FROM dm_stock').all();
    await assert.rejects(() => f.run('stockBulk', {
      stock_ids: rows.map((r: any) => r.stock_id),
      versions: {
        [rows[0].stock_id]: 1,
        [rows[1].stock_id]: 99
      },
      changes: {
        dealer_cost: '18000'
      },
      reason: 'Bulk price correction'
    }), /changed/);
    assert.equal(f.database.prepare('SELECT dealer_cost FROM dm_stock WHERE stock_id=?').get(rows[0].stock_id).dealer_cost, '15000.00');
    await assert.rejects(() => f.sale(rows[0].stock_id, {
      sale_price: '100',
      charges: '0'
    }), /loss/);
    await f.sale(rows[0].stock_id, {
      sale_price: '100',
      charges: '0',
      confirm_loss: true
    });
  });
  it('rejects stale payment previews and cross-dealer allocations while allowing blocked liabilities to settle', async () => {
    const f = fixture();
    const a = await f.createDealer();
    const b = await f.createDealer(4);
    const first = await f.stock(a.dealer_id);
    const sale1 = await f.sale(first.stock_ids[0]);
    await f.pay(a.dealer_id, [sale1.sale_id]);
    const second = await f.stock(a.dealer_id, '8008005413', '20000');
    const sale2 = await f.sale(second.stock_ids[0]);
    await assert.rejects(() => f.run('paymentPreview', {
      dealer_id: b.dealer_id,
      sale_ids: [sale2.sale_id]
    }), /other dealer/);
    const preview = await f.run('paymentPreview', {
      dealer_id: a.dealer_id,
      sale_ids: [sale2.sale_id]
    });
    const row = f.database.prepare('SELECT * FROM dm_sales WHERE sale_id=?').get(sale1.sale_id);
    await f.run('saleCancel', {
      sale_id: row.sale_id,
      version: row.version,
      reason: 'Refund after payment preview'
    });
    await assert.rejects(() => f.run('paymentRecord', {
      dealer_id: a.dealer_id,
      sale_ids: [sale2.sale_id],
      gross_amount: preview.gross_amount,
      recovery_amount: preview.recovery_amount,
      net_amount: preview.net_amount,
      payment_mode: 'CASH',
      paid_at: '2026-10-20T12:00'
    }), /totals changed/);
    const dealer = f.database.prepare('SELECT * FROM dm_dealers WHERE dealer_id=?').get(a.dealer_id);
    await f.run('dealerSave', {
      ...dealer,
      status: 'BLOCKED',
      reason: 'Block new business only'
    });
    const payment = await f.pay(a.dealer_id, [sale2.sale_id]);
    const receipt = await f.run('receipt', {
      payment_id: payment.payment_id
    });
    assert.equal(Number(receipt.payment.net_amount), 5000);
  });
});
