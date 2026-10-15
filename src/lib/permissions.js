// Permission catalogs. There is no catalog endpoint yet (ADM-07.4 / CUS-04.4 are
// gaps), so the codes documented in the Postman collection and Auth design are
// listed here. Codes found on existing roles are merged in by the editor.

export const PLATFORM_PERMISSIONS = [
  { code: 'customer.read', label: 'View customers', category: 'Customers' },
  { code: 'customer.create', label: 'Create customers', category: 'Customers' },
  { code: 'customer.update', label: 'Edit customers', category: 'Customers' },
  {
    code: 'customer.suspend',
    label: 'Suspend customers',
    category: 'Customers',
  },
  {
    code: 'customer.activate',
    label: 'Activate customers',
    category: 'Customers',
  },
  {
    code: 'domain.manage',
    label: 'Manage customer domains',
    category: 'Customer setup',
  },
  {
    code: 'settings.manage',
    label: 'Manage customer settings',
    category: 'Customer setup',
  },
  {
    code: 'package.manage',
    label: 'Create and edit plans',
    category: 'Plans & billing',
  },
  {
    code: 'package.assign',
    label: 'Assign plans to customers',
    category: 'Plans & billing',
  },
  { code: 'staff.manage', label: 'Manage platform staff', category: 'Team' },
  {
    code: 'role.manage',
    label: 'Manage roles and permissions',
    category: 'Team',
  },
];

export const TENANT_PERMISSIONS = [
  { code: 'agent.create', label: 'Create agents', category: 'Agents' },
  { code: 'agent.manage', label: 'Edit, pause and delete agents', category: 'Agents' },
  { code: 'flow.publish', label: 'Publish agents', category: 'Agents' },
  {
    code: 'company_profile.manage',
    label: 'Edit the company profile',
    category: 'Agents',
  },
  {
    code: 'phone_number.manage',
    label: 'Assign agents to phone numbers',
    category: 'Phone numbers',
  },
  {
    code: 'transcripts.view',
    label: 'View call transcripts',
    category: 'Calls',
  },
  { code: 'calls.place', label: 'Place and simulate calls', category: 'Calls' },
  {
    code: 'calls.manage',
    label: 'Correct calls and reset demo data',
    category: 'Calls',
  },
  {
    code: 'billing.view',
    label: 'View plan, usage and invoices',
    category: 'Billing',
  },
  { code: 'staff.manage', label: 'Manage team members', category: 'Team' },
  {
    code: 'role.manage',
    label: 'Manage roles and permissions',
    category: 'Team',
  },
];

export function groupPermissions(defs, extraCodes) {
  const known = new Set(defs.map((d) => d.code));
  const all = [...defs];
  for (const code of extraCodes) {
    if (!known.has(code)) {
      known.add(code);
      all.push({ code, label: code, category: 'Other' });
    }
  }
  const groups = new Map();
  all.forEach((d) => groups.set(d.category, [...(groups.get(d.category) ?? []), d]));
  return [...groups.entries()];
}
