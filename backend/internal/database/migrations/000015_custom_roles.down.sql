ALTER TABLE users DROP CONSTRAINT users_role_fkey;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text, 'user'::text]));
DROP TABLE roles;
