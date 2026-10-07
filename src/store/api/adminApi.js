import { baseApi } from './baseApi';
import { A } from './services';

// Platform admin console: Postman "Platform - Customers", "Platform - Staff &
// Roles", "Packages (Admin)", admin subscription/invoice/usage routes, plus
// the gap routes (ADM-04.4, 05.2, 05.3, 07.4, 09.2, 09.3, 10.3) and proposed
// ADM-11 numbers, ADM-12 overview, AGT-11.7 templates, CMP-04.2 audit.

const C_ID = (_r, _e, arg) => [{ type: 'Customer', id: typeof arg === 'string' ? arg : arg.id }];

export const adminApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Customers ----------------------------------------------------------
    listCustomers: b.query({
      query: ({ limit = 20, offset = 0 } = {}) => A.auth('/admin/customers', { params: { limit, offset } }),
      providesTags: ['Customer'],
    }),
    getCustomer: b.query({ query: (id) => A.auth(`/admin/customers/${id}`), providesTags: C_ID }),
    createCustomer: b.mutation({ query: (body) => A.auth('/admin/customers', { method: 'POST', body }), invalidatesTags: ['Customer'] }),
    updateCustomer: b.mutation({ query: ({ id, ...body }) => A.auth(`/admin/customers/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Customer'] }),
    suspendCustomer: b.mutation({ query: (id) => A.auth(`/admin/customers/${id}/suspend`, { method: 'POST' }), invalidatesTags: ['Customer'] }),
    activateCustomer: b.mutation({ query: (id) => A.auth(`/admin/customers/${id}/activate`, { method: 'POST' }), invalidatesTags: ['Customer'] }),

    // Domains ------------------------------------------------------------
    listDomains: b.query({ query: (tenantId) => A.auth(`/admin/customers/${tenantId}/domains`), providesTags: ['Domain'] }),
    addDomain: b.mutation({
      query: ({ tenantId, domain, is_primary }) => A.auth(`/admin/customers/${tenantId}/domains`, { method: 'POST', body: { domain, is_primary } }),
      invalidatesTags: ['Domain'],
    }),
    deleteDomain: b.mutation({
      query: ({ tenantId, domainId }) => A.auth(`/admin/customers/${tenantId}/domains/${domainId}`, { method: 'DELETE' }),
      invalidatesTags: ['Domain'],
    }),
    verifyDomain: b.mutation({
      query: ({ tenantId, domainId }) => A.auth(`/admin/customers/${tenantId}/domains/${domainId}/verify`, { method: 'POST', body: {} }),
      invalidatesTags: ['Domain'],
    }),

    // Tenant settings ----------------------------------------------------
    getTenantSettings: b.query({ query: (tenantId) => A.auth(`/admin/customers/${tenantId}/settings`), providesTags: ['TenantSettings'] }),
    putTenantSettings: b.mutation({
      query: ({ tenantId, body }) => A.auth(`/admin/customers/${tenantId}/settings`, { method: 'PUT', body }),
      invalidatesTags: ['TenantSettings'],
    }),
    listLlmProviders: b.query({ query: () => A.auth('/admin/catalog/llm-providers') }),

    // Platform roles & staff --------------------------------------------
    listAdminRoles: b.query({ query: () => A.auth('/admin/roles'), providesTags: ['AdminRole'] }),
    createAdminRole: b.mutation({ query: (body) => A.auth('/admin/roles', { method: 'POST', body }), invalidatesTags: ['AdminRole'] }),
    setAdminRolePermissions: b.mutation({
      query: ({ id, permissions }) => A.auth(`/admin/roles/${id}/permissions`, { method: 'PATCH', body: { permissions } }),
      invalidatesTags: ['AdminRole', 'Me'],
    }),
    listAdminPermissions: b.query({ query: () => A.auth('/admin/permissions') }),
    listAdminStaff: b.query({ query: () => A.auth('/admin/staff'), providesTags: ['AdminStaff'] }),
    createAdminStaff: b.mutation({ query: (body) => A.auth('/admin/staff', { method: 'POST', body }), invalidatesTags: ['AdminStaff'] }),
    updateAdminStaff: b.mutation({ query: ({ id, ...body }) => A.auth(`/admin/staff/${id}`, { method: 'PATCH', body }), invalidatesTags: ['AdminStaff'] }),

    // Packages & subscriptions ------------------------------------------
    listAdminPackages: b.query({ query: () => A.billing('/admin/packages'), providesTags: ['Package'] }),
    createPackage: b.mutation({ query: (body) => A.billing('/admin/packages', { method: 'POST', body }), invalidatesTags: ['Package'] }),
    updatePackage: b.mutation({ query: ({ id, ...body }) => A.billing(`/admin/packages/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Package'] }),
    assignPackage: b.mutation({
      query: ({ tenantId, package_id }) => A.billing(`/admin/customers/${tenantId}/subscription/assign`, { method: 'POST', body: { package_id } }),
      invalidatesTags: ['Subscription'],
    }),
    getTenantSubscription: b.query({ query: (tenantId) => A.billing(`/admin/customers/${tenantId}/subscription`), providesTags: ['Subscription'] }),
    getTenantSubscriptionHistory: b.query({
      query: (tenantId) => A.billing(`/admin/customers/${tenantId}/subscription/history`),
      providesTags: ['Subscription'],
    }),
    listTenantInvoices: b.query({ query: (tenantId) => A.billing(`/admin/customers/${tenantId}/invoices`), providesTags: ['Invoice'] }),
    getTenantInvoice: b.query({ query: ({ tenantId, invoiceId }) => A.billing(`/admin/customers/${tenantId}/invoices/${invoiceId}`) }),
    getTenantUsage: b.query({ query: (tenantId) => A.billing(`/admin/customers/${tenantId}/usage`), providesTags: ['Usage'] }),

    // Numbers (ADM-11) ---------------------------------------------------
    listNumberPool: b.query({ query: () => A.telephony('/admin/phone-numbers'), providesTags: ['NumberPool'] }),
    registerNumber: b.mutation({ query: (body) => A.telephony('/admin/phone-numbers', { method: 'POST', body }), invalidatesTags: ['NumberPool'] }),
    allocateNumber: b.mutation({
      query: ({ tenantId, numberId }) => A.telephony(`/admin/customers/${tenantId}/phone-numbers`, { method: 'POST', body: { phone_number_id: numberId } }),
      invalidatesTags: ['NumberPool'],
    }),
    releaseNumber: b.mutation({
      query: ({ tenantId, numberId }) => A.telephony(`/admin/customers/${tenantId}/phone-numbers/${numberId}`, { method: 'DELETE' }),
      invalidatesTags: ['NumberPool'],
    }),
    listTenantNumbers: b.query({ query: (tenantId) => A.telephony(`/admin/customers/${tenantId}/phone-numbers`), providesTags: ['NumberPool'] }),

    // Overview, templates, audit ----------------------------------------
    getPlatformSummary: b.query({ query: () => A.analytics('/admin/analytics/summary'), providesTags: ['Platform'] }),
    getCustomerRanking: b.query({ query: () => A.analytics('/admin/analytics/customers'), providesTags: ['Platform'] }),
    listAdminTemplates: b.query({ query: () => A.flow('/admin/agent-templates'), providesTags: ['Template'] }),
    createAdminTemplate: b.mutation({ query: (body) => A.flow('/admin/agent-templates', { method: 'POST', body }), invalidatesTags: ['Template'] }),
    listAdminAudit: b.query({ query: (params) => A.analytics('/admin/audit-log', { params }), providesTags: ['Audit'] }),
  }),
});

export const {
  useListCustomersQuery,
  useGetCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useSuspendCustomerMutation,
  useActivateCustomerMutation,
  useListDomainsQuery,
  useAddDomainMutation,
  useDeleteDomainMutation,
  useVerifyDomainMutation,
  useGetTenantSettingsQuery,
  usePutTenantSettingsMutation,
  useListLlmProvidersQuery,
  useListAdminRolesQuery,
  useCreateAdminRoleMutation,
  useSetAdminRolePermissionsMutation,
  useListAdminPermissionsQuery,
  useListAdminStaffQuery,
  useCreateAdminStaffMutation,
  useUpdateAdminStaffMutation,
  useListAdminPackagesQuery,
  useCreatePackageMutation,
  useUpdatePackageMutation,
  useAssignPackageMutation,
  useGetTenantSubscriptionQuery,
  useGetTenantSubscriptionHistoryQuery,
  useListTenantInvoicesQuery,
  useLazyGetTenantInvoiceQuery,
  useGetTenantUsageQuery,
  useListNumberPoolQuery,
  useRegisterNumberMutation,
  useAllocateNumberMutation,
  useReleaseNumberMutation,
  useListTenantNumbersQuery,
  useGetPlatformSummaryQuery,
  useGetCustomerRankingQuery,
  useListAdminTemplatesQuery,
  useCreateAdminTemplateMutation,
  useListAdminAuditQuery,
} = adminApi;
