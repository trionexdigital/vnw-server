export interface AuthContact { email: string | null; phone: string | null }
export function mobile(value: unknown): string {
    let number=String(value ?? '').trim().replace(/[\s().-]/g,'');
    if(number.startsWith('+91'))number=number.slice(3);
    else if(number.length===12&&number.startsWith('91'))number=number.slice(2);
    if(!/^[6-9]\d{9}$/.test(number))throw new Error('Enter a valid mobile number or email address.');
    return number;
}
export function emailAddress(value: unknown): string {
    const email=String(value ?? '').trim().toLowerCase();
    if(email.length>128||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid mobile number or email address.');
    return email;
}
export function contact(value: unknown): AuthContact {
    const input=String(value ?? '').trim();
    if(input.includes('@'))return {email:emailAddress(input),phone:null};
    return {email:null,phone:mobile(input)};
}
export function registrationContact(payload: {identifier?:unknown;email?:unknown;phone?:unknown}):AuthContact {
    if(String(payload.identifier ?? '').trim())return contact(payload.identifier);
    const email=String(payload.email ?? '').trim()?emailAddress(payload.email):null;
    const phone=String(payload.phone ?? '').trim()?mobile(payload.phone):null;
    if(!email&&!phone)throw new Error('Enter a valid mobile number or email address.');
    return {email,phone};
}
// Match previously saved Indian mobile formats without choosing between duplicate identities.
export const PHONE_LOOKUP="REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')','') IN (?,?,?)";
export const phoneVariants=(phone:string)=>[phone,'91'+phone,'+91'+phone];
