import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contact, registrationContact } from './contact';
import { PixelsAuth } from './auth';
import { hashPassword, verifyPassword } from '../../../pixels-utility/password';

function fixture() {
    const users:any[]=[{user_id:1,full_name:'Existing Admin',email:'existing@example.test',phone:'+91 98765 43210',password:hashPassword('old-password'),role:'ADMIN',status:'ACTIVE'}];
    const writes:any[]=[];const notifications:any[]=[];
    const dao:any={executeQuery:async(sql:string,args:any[]=[])=>{
        let rows:any[]=[];
        if(sql.startsWith('INSERT INTO auth_user')){
            const [email,phone,password,full_name,role,referral_code,referred_by]=args;
            if(users.some(u=>(email&&u.email===email)||(phone&&u.phone===phone)))return {status:-1,info:'Duplicate email or phone',insertId:0};
            const user_id=users.length+1;users.push({user_id,email,phone,password,full_name,role,referral_code,referred_by,status:'ACTIVE'});writes.push({sql,args});return {status:1,insertId:user_id};
        }
        if(sql.startsWith('UPDATE auth_user SET password')){users.find(u=>u.user_id===args[1]).password=args[0];writes.push({sql,args});return {status:1};}
        if(sql.startsWith('INSERT IGNORE INTO carts')){writes.push({sql,args});return {status:1};}
        if(sql.includes('WHERE email = ?'))rows=users.filter(u=>u.email===args[0]);
        else if(sql.includes('WHERE REPLACE'))rows=users.filter(u=>args.includes(String(u.phone||'').replace(/[ ()-]/g,'')));
        else if(sql.includes('WHERE user_id = ?'))rows=users.filter(u=>u.user_id===args[0]);
        else if(sql.includes('WHERE referral_code = ?'))rows=users.filter(u=>u.referral_code===args[0]);
        return {status:1,rows:rows.map(u=>({...u})),fetchedRows:rows.length};
    }};
    const service=new PixelsAuth(dao,async()=>['user.sell'],async event=>{notifications.push(event);});
    return {service,users,writes,notifications};
}

describe('mobile or email authentication',()=>{
    it('validates contacts without inventing missing identifiers',()=>{
        assert.deepEqual(contact(' Person@Example.test '),{email:'person@example.test',phone:null});
        for(const value of ['9876543210','+91 98765 43210','91-98765-43210'])assert.deepEqual(contact(value),{email:null,phone:'9876543210'});
        assert.deepEqual(registrationContact({email:'person@example.test',phone:'9876543210'}),{email:'person@example.test',phone:'9876543210'});
        for(const value of ['','123','1234567890','person@','+1 9876543210'])assert.throws(()=>contact(value));
    });
    it('keeps legacy email login and roles, and supports saved formatted mobile numbers',async()=>{
        const f=fixture();
        for(const payload of [{email:'existing@example.test'},{identifier:'9876543210'},{identifier:'+91 98765 43210'}]){
            const result:any=await f.service.userLogin({...payload,password:'old-password'});
            assert.equal(result.status,1,result.info);assert.equal(result.data.role,'ADMIN');assert.deepEqual(result.data.permissions,['user.sell']);assert.equal(result.data.password,undefined);
        }
        assert.equal(f.writes.length,0);
    });
    it('rejects wrong passwords, blocked users and ambiguous mobile identities',async()=>{
        const f=fixture();assert.notEqual((await f.service.userLogin({identifier:'9876543210',password:'wrong'})).status,1);
        f.users[0].status='BLOCKED';assert.notEqual((await f.service.userLogin({email:'existing@example.test',password:'old-password'})).status,1);
        f.users[0].status='ACTIVE';f.users.push({...f.users[0],user_id:2,email:'second@example.test',phone:'9876543210'});
        assert.notEqual((await f.service.userLogin({identifier:'9876543210',password:'old-password'})).status,1);
        assert.equal((await f.service.userLogin({email:'existing@example.test',password:'old-password'})).status,1);
    });
    it('registers multiple email-only or mobile-only customers, hashes passwords and creates carts',async()=>{
        const f=fixture();
        for(const identifier of ['one@example.test','two@example.test','9000000001','9000000002']){
            const result:any=await f.service.userRegister({identifier,full_name:'New Customer',password:'new-password',confirm_password:'new-password',...{role:'ADMIN'}});
            assert.equal(result.status,1,result.info);assert.equal(result.data.role,'USER');assert.equal(result.data.password,undefined);
            const stored=f.users.at(-1);assert.ok(verifyPassword('new-password',stored.password));
            assert.equal(identifier.includes('@')?stored.phone:stored.email,null);
        }
        assert.equal(f.notifications.length,4);assert.equal(f.writes.filter(w=>w.sql.includes('carts')).length,4);
    });
    it('retains legacy registration, referrals, duplicate validation and password matching',async()=>{
        const f=fixture();f.users[0].referral_code='LEGACY';
        const result:any=await f.service.userRegister({email:'both@example.test',phone:'9000000003',full_name:'Customer',password:'password',confirm_password:'password',ref_code:'LEGACY'});
        assert.equal(result.status,1,result.info);assert.equal(f.users.at(-1).referred_by,1);
        const duplicate:any=await f.service.userRegister({identifier:'+91 98765 43210',full_name:'Duplicate',password:'password',confirm_password:'password'});assert.notEqual(duplicate.status,1);
        const mismatch:any=await f.service.userRegister({identifier:'new@example.test',full_name:'Customer',password:'password',confirm_password:'different'});assert.notEqual(mismatch.status,1);
    });
    it('upgrades legacy password hashes after mobile login',async()=>{
        const f=fixture();f.users[0].password='legacy-password';const result=await f.service.userLogin({identifier:'9876543210',password:'legacy-password'});
        assert.equal(result.status,1);assert.ok(f.users[0].password.startsWith('scrypt$'));
    });
    it('does not truncate or introduce a new length limit on existing passwords',async()=>{
        const f=fixture();const password='long-password-'.repeat(20);f.users[0].password=hashPassword(password);
        assert.equal((await f.service.userLogin({identifier:'existing@example.test',password})).status,1);
        const created:any=await f.service.userRegister({identifier:'long@example.test',full_name:'Long password',password,confirm_password:password});
        assert.equal(created.status,1,created.info);
        assert.ok(verifyPassword(password,f.users.at(-1).password));
    });
});
