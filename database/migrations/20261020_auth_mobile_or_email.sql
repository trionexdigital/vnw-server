-- Select the application database, back up auth_user, and execute manually.
-- Rerunnable: preserves all existing nonempty contacts, user IDs, password hashes,
-- roles, relationships, and the existing unique email/phone indexes.
-- NULL permits multiple accounts to omit one contact; no invented addresses/numbers.
ALTER TABLE auth_user
  MODIFY COLUMN email varchar(128) NULL DEFAULT NULL,
  MODIFY COLUMN phone varchar(20) NULL DEFAULT NULL;
UPDATE auth_user SET email=NULL WHERE TRIM(email)='';
UPDATE auth_user SET phone=NULL WHERE TRIM(phone)='';
-- Read-only verification:
-- SELECT column_name,is_nullable FROM information_schema.columns
-- WHERE table_schema=DATABASE() AND table_name='auth_user'
-- AND column_name IN ('email','phone');
-- Expected: YES for both. Rollback to NOT NULL requires supplying genuine missing
-- contacts first; do not fabricate contact data or automatically revert the schema.
