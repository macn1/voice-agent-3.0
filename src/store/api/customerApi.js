import { baseApi } from './baseApi';
import { C, P } from './services';

// Customer realm: team & roles (Postman "Customer - Staff & Roles (Tenant)")
// and billing (Postman "Billing Service"), plus billing gap routes (CUS-05.5,
// CUS-07.3, EXT-05 wallet).

export const customerApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Staff --------------------------------------------------------------
    listStaff: b.query({ query: () => C.auth('/customer/staff'), providesTags: ['Staff'] }),
    createStaff: b.mutation({ query: (body) => C.auth('/customer/staff', { method: 'POST', body }), invalidatesTags: ['Staff'] }),
    updateStaff: b.mutation({ query: ({ id, ...body }) => C.auth(`/customer/staff/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Staff', 'Me'] }),
    deleteStaff: b.mutation({ query: (id) => C.auth(`/customer/staff/${id}`, { method: 'DELETE' }), invalidatesTags: ['Staff'] }),

    // Roles --------------------------------------------------------------
    listRoles: b.query({ query: () => C.auth('/customer/roles'), providesTags: ['Role'] }),
    createRole: b.mutation({ query: (body) => C.auth('/customer/roles', { method: 'POST', body }), invalidatesTags: ['Role'] }),
    setRolePermissions: b.mutation({
      query: ({ id, permissions }) => C.auth(`/customer/roles/${id}/permissions`, { method: 'PATCH', body: { permissions } }),
      invalidatesTags: ['Role', 'Me'],
    }),

    // Plans & subscription ----------------------------------------------
    listPublicPackages: b.query({ query: () => P.billing('/packages'), providesTags: ['Package'] }),
    getSubscription: b.query({ query: () => C.billing('/customer/billing/subscription'), providesTags: ['Subscription'] }),
    selectPackage: b.mutation({
      query: (package_id) => C.billing('/customer/billing/subscription/select-package', { method: 'POST', body: { package_id } }),
      invalidatesTags: ['Subscription', 'Usage'],
    }),
    cancelSubscription: b.mutation({ query: () => C.billing('/customer/billing/subscription/cancel', { method: 'POST' }), invalidatesTags: ['Subscription'] }),
    checkout: b.mutation({
      query: (package_id) => C.billing('/customer/billing/checkout-session', { method: 'POST', body: { package_id } }),
      invalidatesTags: ['Subscription'],
    }),

    // Payment methods ----------------------------------------------------
    listPaymentMethods: b.query({ query: () => C.billing('/customer/billing/payment-methods'), providesTags: ['PaymentMethod'] }),
    addPaymentMethod: b.mutation({
      query: (body) => C.billing('/customer/billing/payment-methods', { method: 'POST', body }),
      invalidatesTags: ['PaymentMethod'],
    }),
    setDefaultPaymentMethod: b.mutation({
      query: (id) => C.billing(`/customer/billing/payment-methods/${id}/set-default`, { method: 'POST' }),
      invalidatesTags: ['PaymentMethod'],
    }),
    removePaymentMethod: b.mutation({
      query: (id) => C.billing(`/customer/billing/payment-methods/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['PaymentMethod'],
    }),

    // Invoices & usage ---------------------------------------------------
    listInvoices: b.query({ query: () => C.billing('/customer/billing/invoices'), providesTags: ['Invoice'] }),
    getInvoice: b.query({ query: (id) => C.billing(`/customer/billing/invoices/${id}`), providesTags: (_r, _e, id) => [{ type: 'Invoice', id }] }),
    getInvoicePdf: b.query({ query: (id) => C.billing(`/customer/billing/invoices/${id}/pdf`) }),
    getUsage: b.query({ query: () => C.billing('/customer/billing/usage', { params: { period: 'current' } }), providesTags: ['Usage'] }),

    // Wallet (EXT-05) ----------------------------------------------------
    getWallet: b.query({ query: () => C.billing('/customer/billing/wallet'), providesTags: ['Wallet'] }),
    topUpWallet: b.mutation({
      query: (amount) => C.billing('/customer/billing/wallet/top-up', { method: 'POST', body: { amount } }),
      invalidatesTags: ['Wallet'],
    }),
    listWalletTransactions: b.query({ query: () => C.billing('/customer/billing/wallet/transactions'), providesTags: ['Wallet'] }),
    setAutoRecharge: b.mutation({ query: (body) => C.billing('/customer/billing/wallet/auto-recharge', { method: 'PUT', body }), invalidatesTags: ['Wallet'] }),
  }),
});

export const {
  useListStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffMutation,
  useDeleteStaffMutation,
  useListRolesQuery,
  useCreateRoleMutation,
  useSetRolePermissionsMutation,
  useListPublicPackagesQuery,
  useGetSubscriptionQuery,
  useSelectPackageMutation,
  useCancelSubscriptionMutation,
  useCheckoutMutation,
  useListPaymentMethodsQuery,
  useAddPaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
  useRemovePaymentMethodMutation,
  useListInvoicesQuery,
  useGetInvoiceQuery,
  useLazyGetInvoicePdfQuery,
  useGetUsageQuery,
  useGetWalletQuery,
  useTopUpWalletMutation,
  useListWalletTransactionsQuery,
  useSetAutoRechargeMutation,
} = customerApi;
