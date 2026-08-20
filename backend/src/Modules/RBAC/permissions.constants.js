// Static, code-defined permission catalog — permissions are a fixed
// vocabulary tied 1:1 to protected routes, not user-editable business
// data, so they live here instead of a DB collection. Roles (DB-backed)
// reference these keys in their `permissions` array.

export const PERMISSIONS = [
  { key: 'booking:create', label: 'Create booking', group: 'Booking' },
  { key: 'booking:read', label: 'View bookings', group: 'Booking' },
  { key: 'booking:update', label: 'Update / confirm / cancel booking', group: 'Booking' },
  { key: 'booking:export', label: 'Preview & export bookings', group: 'Booking' },

  { key: 'masterData:read', label: 'View master data', group: 'Master Data' },
  { key: 'masterData:create', label: 'Create master data', group: 'Master Data' },
  { key: 'masterData:update', label: 'Update / toggle master data', group: 'Master Data' },

  { key: 'team:read', label: 'View team & invitations', group: 'Team' },
  { key: 'team:invite', label: 'Invite / resend / revoke', group: 'Team' },
  { key: 'team:update', label: 'Change role / (de)activate members', group: 'Team' },

  { key: 'role:read', label: 'View roles', group: 'RBAC' },
  { key: 'role:create', label: 'Create roles', group: 'RBAC' },
  { key: 'role:update', label: 'Edit role permissions', group: 'RBAC' },
  { key: 'role:delete', label: 'Delete roles', group: 'RBAC' },

  { key: 'auditLog:read', label: 'View audit log', group: 'Audit' },
]

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key)
