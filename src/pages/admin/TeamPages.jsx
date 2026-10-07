import { RolesManager } from '../../components/RolesManager';
import { StaffManager } from '../../components/StaffManager';
import { PageHeader } from '../../components/ui';
import { PLATFORM_PERMISSIONS } from '../../lib/permissions';
import {
  useCreateAdminRoleMutation,
  useCreateAdminStaffMutation,
  useListAdminPermissionsQuery,
  useListAdminRolesQuery,
  useListAdminStaffQuery,
  useSetAdminRolePermissionsMutation,
  useUpdateAdminStaffMutation,
} from '../../store/api/adminApi';
import { ProfilePage } from '../customer/settings/ProfilePage';

const staffHooks = {
  useList: useListAdminStaffQuery,
  useListRoles: useListAdminRolesQuery,
  useCreate: useCreateAdminStaffMutation,
  useUpdate: useUpdateAdminStaffMutation,
};

const roleHooks = {
  useList: useListAdminRolesQuery,
  useCreate: useCreateAdminRoleMutation,
  useSetPermissions: useSetAdminRolePermissionsMutation,
  useCatalog: useListAdminPermissionsQuery,
};

export function AdminStaffPage() {
  return (
    <>
      <PageHeader eyebrow="Team" title="Platform staff" description="Aurlynn team members who can sign in to this console." />
      <StaffManager hooks={staffHooks} title="Staff" noun="staff member" />
    </>
  );
}

export function AdminRolesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Roles & permissions"
        description="Control what each platform role can do — e.g. a Support role that can view customers but not change plans."
      />
      <RolesManager hooks={roleHooks} catalog={PLATFORM_PERMISSIONS} title="Platform roles" />
    </>
  );
}

export function AdminProfilePage() {
  return (
    <>
      <PageHeader eyebrow="Account" title="My profile" />
      <ProfilePage />
    </>
  );
}
