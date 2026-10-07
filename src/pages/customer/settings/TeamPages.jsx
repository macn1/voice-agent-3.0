import { RolesManager } from '../../../components/RolesManager';
import { StaffManager } from '../../../components/StaffManager';
import { TENANT_PERMISSIONS } from '../../../lib/permissions';
import { useListTenantPermissionsQuery, useResendInviteMutation } from '../../../store/api/authApi';
import {
  useCreateRoleMutation,
  useCreateStaffMutation,
  useDeleteStaffMutation,
  useListRolesQuery,
  useListStaffQuery,
  useSetRolePermissionsMutation,
  useUpdateStaffMutation,
} from '../../../store/api/customerApi';

const staffHooks = {
  useList: useListStaffQuery,
  useListRoles: useListRolesQuery,
  useCreate: useCreateStaffMutation,
  useUpdate: useUpdateStaffMutation,
  useRemove: useDeleteStaffMutation,
  useResendInvite: useResendInviteMutation,
};

const roleHooks = {
  useList: useListRolesQuery,
  useCreate: useCreateRoleMutation,
  useSetPermissions: useSetRolePermissionsMutation,
  useCatalog: useListTenantPermissionsQuery,
};

export function TeamPage() {
  return <StaffManager hooks={staffHooks} title="Team" />;
}

export function RolesPage() {
  return <RolesManager hooks={roleHooks} catalog={TENANT_PERMISSIONS} title="Roles" />;
}
