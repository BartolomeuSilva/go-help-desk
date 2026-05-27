import { api } from './client'

export type Permission =
  | 'tickets:create'
  | 'tickets:read'
  | 'tickets:update'
  | 'tickets:reply'
  | 'tickets:delete'
  | 'kb:manage'
  | 'canned:manage'
  | 'tags:manage'
  | 'users:manage'
  | 'settings:manage'

export interface RoleDetails {
  name: string
  description: string
  permissions: Permission[]
  is_system: boolean
  created_at: string
  updated_at: string
}

export async function listRoles(): Promise<RoleDetails[]> {
  const res = await api.get<RoleDetails[]>('/admin/roles')
  return res.data
}

export async function getRole(name: string): Promise<RoleDetails> {
  const res = await api.get<RoleDetails>(`/admin/roles/${name}`)
  return res.data
}

export async function createRole(input: {
  name: string
  description: string
  permissions: Permission[]
}): Promise<RoleDetails> {
  const res = await api.post<RoleDetails>('/admin/roles', input)
  return res.data
}

export async function updateRole(
  name: string,
  patch: {
    description?: string
    permissions?: Permission[]
  }
): Promise<RoleDetails> {
  const res = await api.patch<RoleDetails>(`/admin/roles/${name}`, patch)
  return res.data
}

export async function deleteRole(name: string): Promise<void> {
  await api.delete(`/admin/roles/${name}`)
}
