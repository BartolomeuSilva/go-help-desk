CREATE TABLE roles (
    name text PRIMARY KEY,
    description text NOT NULL DEFAULT '',
    permissions text[] NOT NULL DEFAULT '{}',
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed de perfis do sistema
INSERT INTO roles (name, description, permissions, is_system) VALUES
('admin', 'Administrador com acesso total ao sistema', ARRAY['tickets:create', 'tickets:read', 'tickets:update', 'tickets:reply', 'tickets:delete', 'kb:manage', 'canned:manage', 'tags:manage', 'users:manage', 'settings:manage'], true),
('staff', 'Agente de suporte padrão', ARRAY['tickets:create', 'tickets:read', 'tickets:update', 'tickets:reply', 'kb:manage'], true),
('user', 'Usuário/Cliente final do portal', ARRAY['tickets:create'], true);

-- Ajustar restrição na tabela users
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_fkey FOREIGN KEY (role) REFERENCES roles(name) ON DELETE RESTRICT ON UPDATE CASCADE;
