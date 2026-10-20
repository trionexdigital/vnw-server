import { createHash, randomBytes } from 'crypto';
import * as XLSX from 'xlsx';
import { MySqlClient } from '../../../gen_db/database';
import { hashPassword } from '../../../pixels-utility/password';
import { DM_PERMISSIONS, cents, money, total, id, ids, text, reason, choice, dateTime, stockValues, financials, suggestPayments, requireModulePermission } from './domain';
export interface Identity {
  id: number;
  role: string;
  permissions: string[];
}
const placeholders = (values: unknown[]) => values.map(() => '?').join(',');
const json = (v: unknown) => JSON.stringify(v, (_key, value) => typeof value === 'bigint' ? String(value) : value);
const parse = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
export class DealerManagement {
  constructor(private dao: Pick<MySqlClient, 'getConnection'> = new MySqlClient('pixels')) {}
  private async connection<T>(fn: (db: any) => Promise<T>): Promise<T> {
    const db = await this.dao.getConnection();
    try {
      return await fn(db);
    } finally {
      db.release();
    }
  }
  private async query(db: any, sql: string, args: any[] = []): Promise<any[]> {
    const [rows] = await db.query(sql, args);
    return rows;
  }
  async identity(userId: number): Promise<Identity> {
    return this.connection(async db => {
      const [user] = await this.query(db, 'SELECT user_id,role,status FROM auth_user WHERE user_id=?', [userId]);
      if (!user || user.status !== 'ACTIVE') throw new Error('Access denied: active login required.');
      const rows = await this.query(db, 'SELECT permission_key FROM dm_staff_permissions WHERE user_id=?', [userId]);
      return {
        id: userId,
        role: user.role,
        permissions: rows.map(r => r.permission_key)
      };
    });
  }
  async available(): Promise<boolean> {
    if (process.env.DEALER_MANAGEMENT_ENABLED === 'false') return false;
    try {
      return await this.connection(async db => {
        const rows = await this.query(db, "SELECT config_key,config_value FROM dm_config WHERE config_key IN ('enabled','schema_version')");
        return rows.some(r => r.config_key === 'enabled' && r.config_value === '1') && rows.some(r => r.config_key === 'schema_version' && r.config_value === '1');
      });
    } catch {
      return false;
    }
  }
  async capabilities(userId: number) {
    if (!(await this.available())) return {
      enabled: false,
      permissions: [],
      statement: false
    };
    const actor = await this.identity(userId);
    const linked = await this.connection(db => this.query(db, "SELECT dealer_id FROM dm_dealers WHERE linked_user_id=? AND status='ACTIVE'", [userId]));
    return {
      enabled: true,
      permissions: actor.role === 'ADMIN' ? [...DM_PERMISSIONS] : actor.role === 'EMPLOYEE' ? actor.permissions : [],
      admin: actor.role === 'ADMIN',
      statement: !!linked.length
    };
  }
  private async audit(db: any, actor: Identity, entity: string, entityId: number, action: string, before: any, after: any, why: string) {
    await db.query('INSERT INTO dm_audit (entity_type,entity_id,action,old_json,new_json,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())', [entity, entityId, action, before === null ? null : json(before), after === null ? null : json(after), why, actor.id]);
  }
  private async sequence(db: any, key: string, prefix: string, padding: number) {
    const [row] = await this.query(db, 'SELECT sequence_value FROM dm_sequences WHERE sequence_key=? FOR UPDATE', [key]);
    if (!row) throw new Error('Module sequence is missing. Re-run the module migration.');
    const next = BigInt(row.sequence_value) + BigInt(1);
    await db.query('UPDATE dm_sequences SET sequence_value=? WHERE sequence_key=?', [String(next), key]);
    return prefix + String(next).padStart(padding, '0');
  }
  private async mutate(actor: Identity, action: string, p: any, fn: (db: any) => Promise<any>) {
    const key = text(p.request_key, 80, true);
    if (key.length < 16) throw new Error('A unique request key is required.');
    const hash = createHash('sha256').update(json({
      action,
      actor: actor.id,
      p
    })).digest('hex');
    return this.connection(async db => {
      await db.beginTransaction();
      try {
        // A module-only write mutex gives deterministic lock order, including cross-dealer corrections.
        const mutex = await this.query(db, "SELECT sequence_value FROM dm_sequences WHERE sequence_key='WRITE' FOR UPDATE");
        if (!mutex.length) throw new Error('Module write sequence is missing. Re-run the migration.');
        const [previous] = await this.query(db, 'SELECT * FROM dm_operations WHERE request_key=?', [key]);
        if (previous) {
          if (Number(previous.actor_id) !== actor.id || previous.request_hash !== hash) throw new Error('Request key was already used for a different operation.');
          await db.commit();
          return parse(previous.response_json);
        }
        const result = await fn(db);
        await db.query('INSERT INTO dm_operations (request_key,actor_id,request_hash,response_json,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())', [key, actor.id, hash, json(result)]);
        await db.commit();
        return result;
      } catch (error) {
        await db.rollback();
        throw error;
      }
    });
  }
  private async dealer(db: any, dealerId: unknown, active = false) {
    const [dealer] = await this.query(db, 'SELECT * FROM dm_dealers WHERE dealer_id=? FOR UPDATE', [id(dealerId)]);
    if (!dealer) throw new Error('Module dealer not found.');
    if (active && dealer.status !== 'ACTIVE') throw new Error('This dealer is blocked.');
    return dealer;
  }
  private version(row: any, value: unknown) {
    if (Number(row.version) !== id(value)) throw new Error('This record changed. Reload before saving.');
  }
  private check(actor: Identity, permission: string) {
    requireModulePermission(actor.role, actor.permissions, permission);
  }
  async execute(userId: number, action: string, p: any = {}) {
    if (!(await this.available())) throw new Error('Standalone dealer management is disabled or its migration has not been applied.');
    const actor = await this.identity(userId);
    if (action === 'statement') return this.statement(actor, p);
    const permission: Record<string, string> = {
      dealers: 'dealers.view',
      dealerSave: p.dealer_id ? 'dealers.edit' : 'dealers.create',
      stock: 'stock.view',
      stockSave: 'stock.edit',
      stockAdd: 'stock.upload',
      stockBulk: 'stock.edit',
      importPreview: 'stock.upload',
      importCommit: 'stock.upload',
      export: 'stock.view',
      sales: 'sales.view',
      summary: 'sales.view',
      sell: 'sales.record',
      salePreview: 'adjustments',
      saleCorrect: 'adjustments',
      saleCancel: 'adjustments',
      payments: 'payments.view',
      paymentPreview: 'payments.record',
      paymentRecord: 'payments.record',
      paymentVoid: 'adjustments',
      suggest: 'payments.record',
      receipt: 'payments.view',
      adjustments: 'payments.view',
      audit: 'audit.view'
    };
    if (action === 'staff' || action === 'staffSave' || action === 'accounts') {
      if (actor.role !== 'ADMIN') throw new Error('Admin access required.');
    } else {
      if (!permission[action]) throw new Error('Unknown module action.');
      this.check(actor, permission[action]);
    }
    switch (action) {
      case 'dealers':
        return this.listDealers(p);
      case 'dealerSave':
        return this.mutate(actor, action, p, db => this.saveDealer(db, actor, p));
      case 'accounts':
        return this.connection(db => this.query(db, "SELECT user_id,full_name,email,phone,role FROM auth_user WHERE status='ACTIVE' AND (email LIKE ? OR full_name LIKE ?) ORDER BY user_id DESC LIMIT 100", ['%' + text(p.q, 100) + '%', '%' + text(p.q, 100) + '%']));
      case 'staff':
        return this.connection(async db => ({
          permissions: DM_PERMISSIONS,
          users: await this.query(db, "SELECT user_id,full_name,email FROM auth_user WHERE role='EMPLOYEE' AND status='ACTIVE' ORDER BY full_name"),
          grants: await this.query(db, 'SELECT user_id,permission_key FROM dm_staff_permissions')
        }));
      case 'staffSave':
        return this.mutate(actor, action, p, db => this.saveStaff(db, actor, p));
      case 'stock':
        return this.list('stock', p);
      case 'sales':
        return this.list('sales', p);
      case 'payments':
        return this.list('payments', p);
      case 'adjustments':
        return this.list('adjustments', p);
      case 'audit':
        return this.list('audit', p);
      case 'summary':
        return this.connection(db => this.summary(db, p.dealer_id));
      case 'stockAdd':
        return this.mutate(actor, action, p, db => this.addStock(db, actor, p.rows || [p]));
      case 'stockSave':
        return this.mutate(actor, action, p, db => this.editStock(db, actor, p));
      case 'stockBulk':
        return this.mutate(actor, action, p, db => this.bulkStock(db, actor, p));
      case 'importPreview':
        return this.importPreview(p);
      case 'importCommit':
        return this.mutate(actor, action, p, async db => {
          if (!Array.isArray(p.rows)) throw new Error('Import rows are required.');
          return this.addStock(db, actor, p.rows);
        });
      case 'export':
        return this.exportStock(p);
      case 'sell':
        return this.mutate(actor, action, p, db => this.sell(db, actor, p));
      case 'salePreview':
        return this.connection(db => this.salePreview(db, p));
      case 'saleCancel':
        return this.mutate(actor, action, p, db => this.cancel(db, actor, p));
      case 'saleCorrect':
        return this.mutate(actor, action, p, db => this.correct(db, actor, p));
      case 'paymentPreview':
        return this.connection(db => this.paymentPreview(db, p));
      case 'paymentRecord':
        return this.mutate(actor, action, p, db => this.recordPayment(db, actor, p));
      case 'paymentVoid':
        return this.mutate(actor, action, p, db => this.voidPayment(db, actor, p));
      case 'suggest':
        return this.connection(async db => {
          const rows = await this.query(db, "SELECT sale_id,dealer_cost FROM dm_sales WHERE dealer_id=? AND status='ACTIVE' AND settled_payment_id IS NULL ORDER BY sale_id LIMIT 1001", [id(p.dealer_id)]);
          if (rows.length > 1000) throw new Error('Use manual selection when more than 1,000 numbers are pending.');
          return suggestPayments(rows as any, p.target);
        });
      case 'receipt':
        return this.connection(db => this.receipt(db, id(p.payment_id)));
    }
  }
  private async saveDealer(db: any, actor: Identity, p: any) {
    const values = {
      name: text(p.name, 128, true),
      contact_name: text(p.contact_name, 96, true),
      phone: text(p.phone, 20, true),
      email: text(p.email, 128, true),
      status: choice(p.status || 'ACTIVE', ['ACTIVE', 'BLOCKED'])
    };
    if (!/^\+?[0-9]{10,15}$/.test(values.phone)) throw new Error('Enter a valid mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Enter a valid email.');
    const old = p.dealer_id ? await this.dealer(db, p.dealer_id) : null;
    if (old) this.version(old, p.version);
    const linking = Boolean(p.create_account) || Object.prototype.hasOwnProperty.call(p, 'linked_user_id');
    if (linking && actor.role !== 'ADMIN') throw new Error('Only an admin may link login accounts.');
    let linked = old?.linked_user_id ?? null;
    if (linking) {
      linked = p.linked_user_id ? id(p.linked_user_id) : null;
    }
    if (p.create_account) {
      if (linked) throw new Error('Choose either account creation or linking.');
      const password = String(p.password || '');
      if (password.length < 8 || password.length > 128) throw new Error('New account password must have 8–128 characters.');
      const [insert]: any = await db.query("INSERT INTO auth_user (email,phone,password,full_name,role,status,referral_code) VALUES (?,?,?,?,'USER','ACTIVE',?)", [values.email, values.phone, hashPassword(password), values.contact_name, 'DM' + randomBytes(6).toString('hex')]);
      linked = insert.insertId;
    }
    if (linked) {
      const [account] = await this.query(db, "SELECT user_id FROM auth_user WHERE user_id=? AND status='ACTIVE'", [linked]);
      if (!account) throw new Error('Choose an active login account.');
    }
    if (old) {
      const why = reason(p.reason);
      await db.query('UPDATE dm_dealers SET name=?,contact_name=?,phone=?,email=?,status=?,linked_user_id=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE dealer_id=?', [...Object.values(values), linked, old.dealer_id]);
      await this.audit(db, actor, 'DEALER', old.dealer_id, 'UPDATED', old, {
        ...values,
        linked_user_id: linked
      }, why);
      return {
        dealer_id: old.dealer_id
      };
    }
    const type = choice(p.dealer_type, ['BASIC', 'PREMIUM']);
    const code = await this.sequence(db, type, type === 'BASIC' ? 'VNW-B' : 'VNW-P', 3);
    const [insert]: any = await db.query('INSERT INTO dm_dealers (dealer_code,dealer_type,name,contact_name,phone,email,status,linked_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())', [code, type, ...Object.values(values), linked, actor.id]);
    await this.audit(db, actor, 'DEALER', insert.insertId, 'CREATED', null, {
      ...values,
      dealer_code: code,
      linked_user_id: linked
    }, 'Dealer created');
    return {
      dealer_id: insert.insertId,
      dealer_code: code
    };
  }
  private async saveStaff(db: any, actor: Identity, p: any) {
    const user = id(p.target_id);
    const [row] = await this.query(db, "SELECT user_id FROM auth_user WHERE user_id=? AND role='EMPLOYEE' AND status='ACTIVE'", [user]);
    if (!row) throw new Error('Choose an active employee.');
    if (!Array.isArray(p.permissions) || p.permissions.some((k: any) => !DM_PERMISSIONS.includes(k))) throw new Error('Invalid module permissions.');
    const old = await this.query(db, 'SELECT permission_key FROM dm_staff_permissions WHERE user_id=?', [user]);
    await db.query('DELETE FROM dm_staff_permissions WHERE user_id=?', [user]);
    for (const key of new Set<string>(p.permissions)) await db.query('INSERT INTO dm_staff_permissions VALUES (?,?,?,UTC_TIMESTAMP())', [user, key, actor.id]);
    await this.audit(db, actor, 'STAFF', user, 'PERMISSIONS', old, p.permissions, reason(p.reason));
    return {
      saved: true
    };
  }
  private page(p: any) {
    return {
      page: Math.max(1, Math.floor(Number(p.page) || 1)),
      limit: Math.min(100, Math.max(1, Math.floor(Number(p.limit) || 25)))
    };
  }
  private filters(kind: string, p: any) {
    const args: any[] = [];
    const conditions: string[] = [];
    if (p.dealer_id) {
      conditions.push('x.dealer_id=?');
      args.push(id(p.dealer_id));
    }
    if (p.dealer_type) {
      conditions.push('d.dealer_type=?');
      args.push(choice(p.dealer_type, ['BASIC', 'PREMIUM']));
    }
    if (p.q) {
      const fields = kind === 'stock' ? ['x.number_value', 'd.dealer_code', 'd.name'] : kind === 'sales' ? ['x.number_value', 'd.dealer_code', 'd.name', 'x.external_reference'] : kind === 'payments' ? ['x.payment_code', 'x.reference_no', 'd.dealer_code', 'd.name', "(SELECT GROUP_CONCAT(s.number_value) FROM dm_payment_allocations a JOIN dm_sales s ON s.sale_id=a.sale_id WHERE a.payment_id=x.payment_id)"] : ['d.dealer_code', 'd.name', 'x.reason'];
      conditions.push('(' + fields.map(f => `${f} LIKE ?`).join(' OR ') + ')');
      fields.forEach(() => args.push('%' + text(p.q, 100) + '%'));
    }
    if (kind === 'stock' && p.state) {
      conditions.push('x.state=?');
      args.push(choice(p.state, ['INVENTORY', 'SOLD', 'INACTIVE']));
    }
    if (kind === 'stock' && p.readiness) {
      conditions.push('x.readiness=?');
      args.push(choice(p.readiness, ['RTP', 'NON_RTP', 'RTA']));
    }
    if (kind === 'sales') {
      if (p.status) {
        conditions.push('x.status=?');
        args.push(choice(p.status, ['ACTIVE', 'CANCELLED']));
      }
      if (p.source) {
        conditions.push('x.sale_source=?');
        args.push(choice(p.source, ['ONLINE', 'OFFLINE']));
      }
      if (p.settlement) {
        choice(p.settlement, ['PAID', 'PENDING']);
        conditions.push("x.status='ACTIVE'");
        conditions.push(`x.settled_payment_id IS ${p.settlement === 'PAID' ? 'NOT ' : ''}NULL`);
      }
    }
    if (kind === 'payments' && p.status) {
      conditions.push('x.status=?');
      args.push(choice(p.status, ['POSTED', 'VOIDED']));
    }
    const dateColumn = kind === 'sales' ? 'x.sold_at' : kind === 'payments' ? 'x.paid_at' : 'x.created_at';
    if (p.from) {
      conditions.push(`${dateColumn}>=?`);
      args.push(dateTime(`${text(p.from, 10, true)} 00:00:00`));
    }
    if (p.to) {
      conditions.push(`${dateColumn}<=?`);
      args.push(dateTime(`${text(p.to, 10, true)} 23:59:59`));
    }
    return {
      sql: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '',
      args
    };
  }
  private async listDealers(p: any) {
    return this.connection(async db => {
      const {
        page,
        limit
      } = this.page(p);
      const args: any[] = [];
      const conditions: string[] = [];
      if (p.q) {
        conditions.push('(name LIKE ? OR dealer_code LIKE ? OR phone LIKE ? OR email LIKE ?)');
        for (let i = 0; i < 4; i++) args.push('%' + text(p.q, 100) + '%');
      }
      if (p.dealer_type) {
        conditions.push('dealer_type=?');
        args.push(choice(p.dealer_type, ['BASIC', 'PREMIUM']));
      }
      if (p.dealer_id) {
        conditions.push('dealer_id=?');
        args.push(id(p.dealer_id));
      }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const [count] = await this.query(db, 'SELECT COUNT(*) AS total FROM dm_dealers' + where, args);
      return {
        items: await this.query(db, 'SELECT * FROM dm_dealers' + where + ' ORDER BY dealer_id DESC LIMIT ? OFFSET ?', [...args, limit, (page - 1) * limit]),
        total: Number(count.total),
        page,
        limit
      };
    });
  }
  private async list(kind: string, p: any) {
    return this.connection(async db => {
      const {
        page,
        limit
      } = this.page(p);
      if (kind === 'audit') {
        const args: any[] = [];
        const parts: string[] = [];
        if (p.entity_type) {
          parts.push('entity_type=?');
          args.push(choice(p.entity_type, ['DEALER', 'STOCK', 'SALE', 'PAYMENT', 'STAFF']));
        }
        if (p.entity_id) {
          parts.push('entity_id=?');
          args.push(id(p.entity_id));
        }
        if (p.q) {
          parts.push('(reason LIKE ? OR action LIKE ?)');
          args.push('%' + text(p.q, 100) + '%', '%' + text(p.q, 100) + '%');
        }
        if (p.from) {
          parts.push('created_at>=?');
          args.push(dateTime(`${text(p.from, 10, true)} 00:00:00`));
        }
        if (p.to) {
          parts.push('created_at<=?');
          args.push(dateTime(`${text(p.to, 10, true)} 23:59:59`));
        }
        const where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
        const [count] = await this.query(db, 'SELECT COUNT(*) AS total FROM dm_audit' + where, args);
        return {
          items: await this.query(db, 'SELECT * FROM dm_audit' + where + ' ORDER BY audit_id DESC LIMIT ? OFFSET ?', [...args, limit, (page - 1) * limit]),
          total: Number(count.total),
          page,
          limit
        };
      }
      const table = ({
        stock: 'dm_stock',
        sales: 'dm_sales',
        payments: 'dm_payments',
        adjustments: 'dm_adjustments'
      } as any)[kind];
      const pk = ({
        stock: 'stock_id',
        sales: 'sale_id',
        payments: 'payment_id',
        adjustments: 'adjustment_id'
      } as any)[kind];
      const f = this.filters(kind, p);
      const from = ` FROM ${table} x JOIN dm_dealers d ON d.dealer_id=x.dealer_id`;
      const [count] = await this.query(db, 'SELECT COUNT(*) AS total' + from + f.sql, f.args);
      const extra = kind === 'sales' ? ",x.sale_price-x.dealer_cost AS commission,x.sale_price-x.dealer_cost-x.charges AS profit,IF(x.status='CANCELLED','CANCELLED',IF(x.settled_payment_id IS NULL,'PENDING','PAID')) AS settlement_status" : '';
      const items = await this.query(db, 'SELECT x.*,d.name AS dealer_name,d.dealer_code' + extra + from + f.sql + ` ORDER BY x.${pk} DESC LIMIT ? OFFSET ?`, [...f.args, limit, (page - 1) * limit]);
      let summary: any;
      if (kind === 'sales') [summary] = await this.query(db, "SELECT COUNT(*) AS total_sales,COALESCE(SUM(IF(x.status='ACTIVE',x.sale_price,0)),0) AS revenue,COALESCE(SUM(IF(x.status='ACTIVE',x.dealer_cost,0)),0) AS dealer_cost,COALESCE(SUM(IF(x.status='ACTIVE',x.charges,0)),0) AS expenses,COALESCE(SUM(IF(x.status='ACTIVE',x.sale_price-x.dealer_cost-x.charges,0)),0) AS profit,COALESCE(SUM(IF(x.status='ACTIVE' AND x.settled_payment_id IS NULL,x.dealer_cost,0)),0) AS pending" + from + f.sql, f.args);
      return {
        items,
        total: Number(count.total),
        page,
        limit,
        summary
      };
    });
  }
  private async summary(db: any, dealerId?: unknown) {
    const where = dealerId ? ' WHERE dealer_id=?' : '';
    const params = dealerId ? [id(dealerId)] : [];
    const [stock] = await this.query(db, "SELECT COUNT(*) AS total_stock,SUM(state='INVENTORY') AS live,SUM(state='SOLD') AS sold FROM dm_stock" + where, params);
    const [sales] = await this.query(db, "SELECT COALESCE(SUM(IF(status='ACTIVE',dealer_cost,0)),0) AS total_payable,COALESCE(SUM(IF(status='ACTIVE' AND settled_payment_id IS NOT NULL,dealer_cost,0)),0) AS paid,COALESCE(SUM(IF(status='ACTIVE' AND settled_payment_id IS NULL,dealer_cost,0)),0) AS pending,COALESCE(SUM(IF(status='ACTIVE',sale_price-dealer_cost-charges,0)),0) AS profit FROM dm_sales" + where, params);
    const recovery = await this.recoveries(db, dealerId ? id(dealerId) : undefined);
    const [payments] = await this.query(db, "SELECT COALESCE(SUM(net_amount),0) AS cash_paid FROM dm_payments WHERE status='POSTED'" + (dealerId ? ' AND dealer_id=?' : ''), params);
    return {
      ...stock,
      ...sales,
      cleared_amount: sales.paid,
      paid: payments.cash_paid,
      recovery_outstanding: total(recovery.map(r => r.remaining))
    };
  }
  private async insertStock(db: any, actor: Identity, value: any) {
    const columns = Object.keys(value);
    const [insert]: any = await db.query(`INSERT INTO dm_stock (${columns.join(',')},created_by,created_at,updated_at) VALUES (${placeholders(columns)},?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [...Object.values(value), actor.id]);
    await this.audit(db, actor, 'STOCK', insert.insertId, 'CREATED', null, value, 'Stock added');
    return insert.insertId;
  }
  private async addStock(db: any, actor: Identity, rows: any[]) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('Upload between 1 and 1,000 numbers.');
    const values = rows.map(stockValues);
    if (new Set(values.map(v => v.number_value)).size !== values.length) throw new Error('Duplicate numbers in this batch.');
    const created: number[] = [];
    for (const value of values) {
      await this.dealer(db, value.dealer_id, true);
      created.push(await this.insertStock(db, actor, value));
    }
    return {
      created: created.length,
      stock_ids: created
    };
  }
  private async editStock(db: any, actor: Identity, p: any) {
    const [old] = await this.query(db, 'SELECT * FROM dm_stock WHERE stock_id=? FOR UPDATE', [id(p.stock_id)]);
    if (!old) throw new Error('Stock not found.');
    this.version(old, p.version);
    const value = stockValues({
      ...old,
      ...p
    });
    if (value.dealer_cost !== money(cents(old.dealer_cost)) || value.selling_price !== money(cents(old.selling_price))) this.check(actor, 'stock.price');
    if (value.dealer_id !== Number(old.dealer_id)) this.check(actor, 'stock.dealer');
    if (old.state === 'SOLD' && (value.number_value !== old.number_value || value.dealer_id !== Number(old.dealer_id))) throw new Error('Correct sold number identity or dealer through a sale adjustment.');
    if (old.state !== 'SOLD') await this.dealer(db, value.dealer_id, true);
    const state = p.state ? choice(p.state, ['INVENTORY', 'INACTIVE', 'SOLD']) : old.state;
    if (old.state === 'SOLD' && state !== 'SOLD') throw new Error('Reverse the sale before changing stock state.');
    if (old.state !== 'SOLD' && state === 'SOLD') throw new Error('Use sale confirmation to mark a number sold.');
    const why = reason(p.reason);
    const fields = Object.keys(value);
    await db.query(`UPDATE dm_stock SET ${fields.map(k => k + '=?').join(',')},state=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE stock_id=?`, [...Object.values(value), state, old.stock_id]);
    await this.audit(db, actor, 'STOCK', old.stock_id, 'UPDATED', old, {
      ...value,
      state
    }, why);
    return {
      saved: true
    };
  }
  private async bulkStock(db: any, actor: Identity, p: any) {
    const selected = ids(p.stock_ids);
    const fields = ['dealer_cost', 'selling_price', 'readiness', 'rtp_date', 'dealer_id', 'state'];
    const changes: any = {};
    for (const field of fields) if (p.changes?.[field] !== undefined) changes[field] = p.changes[field];
    if (!Object.keys(changes).length) throw new Error('Choose a bulk change.');
    for (const stockId of selected) {
      if (!p.versions?.[stockId]) throw new Error('Reload the selection before saving.');
      await this.editStock(db, actor, {
        ...changes,
        stock_id: stockId,
        version: p.versions[stockId],
        reason: p.reason
      });
    }
    return {
      updated: selected.length
    };
  }
  private async importPreview(p: any) {
    const content = text(p.content_base64, 8_000_000, true);
    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > 5_000_000) throw new Error('File exceeds 5 MB.');
    const book = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      sheetRows: 1002
    });
    const raw: any[] = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      raw: false,
      defval: ''
    });
    if (!raw.length || raw.length > 1000) throw new Error('Import between 1 and 1,000 rows.');
    const seen = new Set<string>();
    const rows = raw.map((row, index) => {
      try {
        const value = stockValues({
          ...row,
          dealer_id: p.dealer_id || row.dealer_id
        });
        if (seen.has(value.number_value)) throw new Error('Duplicate number in file.');
        seen.add(value.number_value);
        return {
          row: index + 2,
          values: value,
          error: null
        };
      } catch (e: any) {
        return {
          row: index + 2,
          values: row,
          error: e.message
        };
      }
    });
    await this.connection(async db => {
      for (const row of rows) {
        if (row.error) continue;
        try {
          await this.dealer(db, (row.values as any).dealer_id, true);
          const existing = await this.query(db, "SELECT stock_id FROM dm_stock WHERE number_value=? AND state<>'INACTIVE'", [(row.values as any).number_value]);
          if (existing.length) row.error = 'Number already exists in module inventory.';
        } catch (e: any) {
          row.error = e.message;
        }
      }
    });
    return {
      rows,
      ready: rows.filter(r => !r.error).length,
      total: rows.length
    };
  }
  private async exportStock(p: any) {
    return this.connection(async db => {
      const f = this.filters('stock', p);
      const rows = await this.query(db, 'SELECT x.dealer_id,x.number_value,x.dealer_cost,x.selling_price,x.readiness,DATE_FORMAT(x.rtp_date,\'%Y-%m-%d\') AS rtp_date,x.remarks FROM dm_stock x JOIN dm_dealers d ON d.dealer_id=x.dealer_id' + f.sql + ' ORDER BY x.stock_id LIMIT 10001', f.args);
      if (rows.length > 10000) throw new Error('Narrow filters to export at most 10,000 records.');
      const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['dealer_id', 'number_value', 'dealer_cost', 'selling_price', 'readiness', 'rtp_date', 'remarks']]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Dealer stock');
      return {
        filename: 'standalone-dealer-stock.xlsx',
        content_base64: XLSX.write(book, {
          type: 'base64',
          bookType: 'xlsx'
        })
      };
    });
  }
  private async sell(db: any, actor: Identity, p: any, replaces?: number) {
    const [stock] = await this.query(db, 'SELECT * FROM dm_stock WHERE stock_id=? FOR UPDATE', [id(p.stock_id)]);
    if (!stock || stock.state !== 'INVENTORY') throw new Error('Only unsold live module stock can be sold.');
    this.version(stock, p.version);
    await this.dealer(db, stock.dealer_id, true);
    const amounts = financials(stock.dealer_cost, p.sale_price ?? stock.selling_price, p.charges ?? '0');
    if (cents(amounts.sale_price) - cents(amounts.dealer_cost) - cents(amounts.charges, true) < BigInt(0) && p.confirm_loss !== true) throw new Error(`This sale makes a loss of ₹${amounts.profit}. Confirm the loss to continue.`);
    const source = choice(p.sale_source, ['ONLINE', 'OFFLINE']);
    const sold = dateTime(p.sold_at);
    const reference = text(p.external_reference, 128);
    const [insert]: any = await db.query('INSERT INTO dm_sales (stock_id,dealer_id,number_value,dealer_cost,sale_price,charges,sale_source,external_reference,sold_at,replaces_sale_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [stock.stock_id, stock.dealer_id, stock.number_value, amounts.dealer_cost, amounts.sale_price, amounts.charges, source, reference, sold, replaces || null, actor.id]);
    await db.query("UPDATE dm_stock SET state='SOLD',version=version+1,updated_at=UTC_TIMESTAMP() WHERE stock_id=?", [stock.stock_id]);
    await this.audit(db, actor, 'SALE', insert.insertId, replaces ? 'CORRECTION_CREATED' : 'SOLD', null, {
      ...amounts,
      stock_id: stock.stock_id,
      dealer_id: stock.dealer_id,
      number_value: stock.number_value,
      source,
      reference,
      sold_at: sold,
      replaces_sale_id: replaces
    }, replaces ? reason(p.reason) : 'Sale confirmed');
    return {
      sale_id: insert.insertId,
      ...amounts
    };
  }
  private async salePreview(db: any, p: any) {
    const [sale] = await this.query(db, 'SELECT * FROM dm_sales WHERE sale_id=?', [id(p.sale_id)]);
    if (!sale || sale.status !== 'ACTIVE') throw new Error('Active sale not found.');
    const amounts = financials(p.dealer_cost ?? sale.dealer_cost, p.sale_price ?? sale.sale_price, p.charges ?? sale.charges);
    return {
      sale,
      ...amounts,
      payable_change: money(cents(amounts.dealer_cost) - cents(sale.dealer_cost)),
      profit_change: money(cents(amounts.sale_price) - cents(amounts.dealer_cost) - cents(amounts.charges, true) - (cents(sale.sale_price) - cents(sale.dealer_cost) - cents(sale.charges, true))),
      requires_recovery: !!sale.settled_payment_id
    };
  }
  private async cancel(db: any, actor: Identity, p: any) {
    const [sale] = await this.query(db, 'SELECT * FROM dm_sales WHERE sale_id=? FOR UPDATE', [id(p.sale_id)]);
    if (!sale || sale.status !== 'ACTIVE') throw new Error('Active sale not found.');
    this.version(sale, p.version);
    const why = reason(p.reason);
    await this.dealer(db, sale.dealer_id);
    await db.query("UPDATE dm_sales SET status='CANCELLED',version=version+1 WHERE sale_id=?", [sale.sale_id]);
    await db.query("UPDATE dm_stock SET state='INVENTORY',version=version+1,updated_at=UTC_TIMESTAMP() WHERE stock_id=?", [sale.stock_id]);
    await db.query('INSERT INTO dm_adjustments (dealer_id,sale_id,source_payment_id,adjustment_type,amount,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())', [sale.dealer_id, sale.sale_id, sale.settled_payment_id, sale.settled_payment_id ? 'RECOVERY' : 'PAYABLE_REVERSAL', sale.dealer_cost, why, actor.id]);
    await this.audit(db, actor, 'SALE', sale.sale_id, 'CANCELLED', sale, {
      status: 'CANCELLED',
      recovery: !!sale.settled_payment_id
    }, why);
    return {
      cancelled: true,
      recovery: !!sale.settled_payment_id
    };
  }
  private async correct(db: any, actor: Identity, p: any) {
    this.check(actor, 'sales.record');
    this.check(actor, 'stock.edit');
    const preview = await this.salePreview(db, p);
    if (p.confirm_impact !== true) throw new Error('Confirm the financial impact before correcting this sale.');
    await this.cancel(db, actor, p);
    const [stock] = await this.query(db, 'SELECT * FROM dm_stock WHERE stock_id=? FOR UPDATE', [preview.sale.stock_id]);
    await this.editStock(db, actor, {
      stock_id: stock.stock_id,
      version: stock.version,
      number_value: p.number_value ?? preview.sale.number_value,
      dealer_id: p.dealer_id ?? preview.sale.dealer_id,
      dealer_cost: p.dealer_cost ?? preview.sale.dealer_cost,
      reason: p.reason
    });
    const [updated] = await this.query(db, 'SELECT * FROM dm_stock WHERE stock_id=?', [stock.stock_id]);
    return this.sell(db, actor, {
      ...p,
      stock_id: stock.stock_id,
      version: updated.version,
      sale_price: preview.sale_price,
      charges: preview.charges,
      sale_source: p.sale_source ?? preview.sale.sale_source,
      sold_at: p.sold_at ?? String(preview.sale.sold_at).replace('T', ' ').slice(0, 19),
      external_reference: p.external_reference ?? preview.sale.external_reference
    }, preview.sale.sale_id);
  }
  private async recoveries(db: any, dealerId?: number) {
    return this.query(db, "SELECT a.*,a.amount-COALESCE((SELECT SUM(r.amount) FROM dm_recovery_allocations r JOIN dm_payments p ON p.payment_id=r.payment_id WHERE r.adjustment_id=a.adjustment_id AND p.status='POSTED'),0) AS remaining FROM dm_adjustments a JOIN dm_payments original ON original.payment_id=a.source_payment_id WHERE a.adjustment_type='RECOVERY' AND original.status='POSTED'" + (dealerId ? ' AND a.dealer_id=?' : '') + ' HAVING remaining>0 ORDER BY a.adjustment_id', dealerId ? [dealerId] : []);
  }
  private async paymentPreview(db: any, p: any) {
    const dealer = await this.dealer(db, p.dealer_id);
    const selected = ids(p.sale_ids);
    const rows = await this.query(db, `SELECT * FROM dm_sales WHERE sale_id IN (${placeholders(selected)}) ORDER BY sale_id FOR UPDATE`, selected);
    if (rows.length !== selected.length || rows.some(r => Number(r.dealer_id) !== Number(dealer.dealer_id) || r.status !== 'ACTIVE' || r.settled_payment_id !== null)) throw new Error('Selection includes a paid, cancelled, missing, or other dealer’s sale. Reload the pending list.');
    const gross = total(rows.map(r => r.dealer_cost));
    const recoveries = await this.recoveries(db, dealer.dealer_id);
    const available = cents(total(recoveries.map(r => r.remaining)), true);
    const g = cents(gross);
    const recovered = available < g ? available : g;
    return {
      dealer,
      rows,
      gross_amount: gross,
      recovery_amount: money(recovered),
      net_amount: money(g - recovered),
      recoveries
    };
  }
  private async recordPayment(db: any, actor: Identity, p: any) {
    const preview = await this.paymentPreview(db, p);
    // Expected amounts ensure a stale confirmation cannot silently apply new recoveries or costs.
    for (const field of ['gross_amount', 'recovery_amount', 'net_amount']) if (money(cents(p[field], true)) !== preview[field as keyof typeof preview]) throw new Error('Payment totals changed. Review the payment preview again.');
    const mode = choice(p.payment_mode, ['UPI', 'BANK', 'CASH', 'OTHER']);
    const reference = text(p.reference_no, 128);
    if (['UPI', 'BANK'].includes(mode) && !reference) throw new Error('A reference is required for UPI or bank payments.');
    const paid = dateTime(p.paid_at);
    const notes = text(p.notes);
    const code = await this.sequence(db, 'PAYMENT', 'VNW-PAY-', 6);
    const [insert]: any = await db.query('INSERT INTO dm_payments (payment_code,dealer_id,gross_amount,recovery_amount,net_amount,payment_mode,reference_no,notes,paid_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [code, preview.dealer.dealer_id, preview.gross_amount, preview.recovery_amount, preview.net_amount, mode, reference, notes, paid, actor.id]);
    for (const sale of preview.rows) {
      await db.query('INSERT INTO dm_payment_allocations VALUES (?,?,?)', [insert.insertId, sale.sale_id, sale.dealer_cost]);
      await db.query('UPDATE dm_sales SET settled_payment_id=?,version=version+1 WHERE sale_id=?', [insert.insertId, sale.sale_id]);
    }
    let left = cents(preview.recovery_amount, true);
    for (const recovery of preview.recoveries) {
      if (!left) break;
      const available = cents(recovery.remaining);
      const applied = available < left ? available : left;
      await db.query('INSERT INTO dm_recovery_allocations VALUES (?,?,?)', [insert.insertId, recovery.adjustment_id, money(applied)]);
      left -= applied;
    }
    await this.audit(db, actor, 'PAYMENT', insert.insertId, 'POSTED', null, {
      payment_code: code,
      sale_ids: preview.rows.map(r => r.sale_id),
      gross: preview.gross_amount,
      recovery: preview.recovery_amount,
      net: preview.net_amount,
      reference,
      paid_at: paid
    }, 'Settlement recorded');
    return {
      payment_id: insert.insertId,
      payment_code: code
    };
  }
  private async voidPayment(db: any, actor: Identity, p: any) {
    const [payment] = await this.query(db, 'SELECT * FROM dm_payments WHERE payment_id=? FOR UPDATE', [id(p.payment_id)]);
    if (!payment || payment.status !== 'POSTED') throw new Error('Posted payment not found.');
    const why = reason(p.reason);
    const dependent = await this.query(db, "SELECT r.payment_id FROM dm_adjustments a JOIN dm_recovery_allocations r ON r.adjustment_id=a.adjustment_id JOIN dm_payments p ON p.payment_id=r.payment_id WHERE a.source_payment_id=? AND p.status='POSTED' LIMIT 1", [payment.payment_id]);
    if (dependent.length) throw new Error('Reverse the later recovery settlement first.');
    await db.query("UPDATE dm_payments SET status='VOIDED' WHERE payment_id=?", [payment.payment_id]);
    await db.query('UPDATE dm_sales SET settled_payment_id=NULL,version=version+1 WHERE settled_payment_id=?', [payment.payment_id]);
    await this.audit(db, actor, 'PAYMENT', payment.payment_id, 'VOIDED', payment, {
      status: 'VOIDED'
    }, why);
    return {
      voided: true
    };
  }
  private async receipt(db: any, paymentId: number) {
    const [payment] = await this.query(db, 'SELECT p.*,d.dealer_code,d.name,d.phone,u.full_name AS staff_name FROM dm_payments p JOIN dm_dealers d ON d.dealer_id=p.dealer_id JOIN auth_user u ON u.user_id=p.created_by WHERE p.payment_id=?', [paymentId]);
    if (!payment) throw new Error('Payment not found.');
    const numbers = await this.query(db, 'SELECT s.number_value,a.amount,s.sale_id FROM dm_payment_allocations a JOIN dm_sales s ON s.sale_id=a.sale_id WHERE a.payment_id=? ORDER BY s.sale_id', [paymentId]);
    const recovery_allocations = await this.query(db, 'SELECT r.adjustment_id,r.amount,a.reason FROM dm_recovery_allocations r JOIN dm_adjustments a ON a.adjustment_id=r.adjustment_id WHERE r.payment_id=?', [paymentId]);
    const [pending] = await this.query(db, "SELECT COUNT(*) AS number_count,COALESCE(SUM(dealer_cost),0) AS amount FROM dm_sales WHERE dealer_id=? AND status='ACTIVE' AND settled_payment_id IS NULL", [payment.dealer_id]);
    return {
      payment,
      numbers,
      recovery_allocations,
      pending
    };
  }
  private async statement(actor: Identity, p: any) {
    return this.connection(async db => {
      // Ownership is derived only from the verified login. Staff use an explicit, permission-checked dealer ID.
      let dealer: any;
      if (['ADMIN', 'EMPLOYEE'].includes(actor.role) && p.dealer_id) {
        this.check(actor, 'payments.view');
        dealer = await this.dealer(db, p.dealer_id);
      } else {
        [dealer] = await this.query(db, "SELECT dealer_id,dealer_code,name,status FROM dm_dealers WHERE linked_user_id=?", [actor.id]);
        if (!dealer || dealer.status !== 'ACTIVE') throw new Error('No active dealer statement is linked to this login.');
      }
      const {
        page,
        limit
      } = this.page(p);
      const filter = this.filters('sales', {
        dealer_id: dealer.dealer_id,
        q: p.q,
        settlement: p.settlement,
        from: p.from,
        to: p.to
      });
      const base = ' FROM dm_sales x JOIN dm_dealers d ON d.dealer_id=x.dealer_id LEFT JOIN dm_payments pay ON pay.payment_id=x.settled_payment_id';
      const [count] = await this.query(db, 'SELECT COUNT(*) AS total' + base + filter.sql, filter.args);
      const items = await this.query(db, "SELECT x.sale_id,x.number_value,x.sold_at,x.dealer_cost AS dealer_amount,IF(x.status='CANCELLED','CANCELLED',IF(x.settled_payment_id IS NULL,'PENDING','PAID')) AS settlement_status,pay.paid_at,pay.payment_code" + base + filter.sql + ' ORDER BY x.sale_id DESC LIMIT ? OFFSET ?', [...filter.args, limit, (page - 1) * limit]);
      const summary = await this.summary(db, dealer.dealer_id);
      const adjustments = await this.query(db, "SELECT adjustment_id,sale_id,adjustment_type,amount,created_at FROM dm_adjustments WHERE dealer_id=? ORDER BY adjustment_id DESC LIMIT 100", [dealer.dealer_id]);
      return {
        dealer: {
          dealer_code: dealer.dealer_code,
          name: dealer.name
        },
        items,
        total: Number(count.total),
        page,
        limit,
        summary: {
          total_sold: summary.total_payable,
          total_paid: summary.paid,
          pending: summary.pending,
          recovery_outstanding: summary.recovery_outstanding
        },
        adjustments
      };
    });
  }
}
