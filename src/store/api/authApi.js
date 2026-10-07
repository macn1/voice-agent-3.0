import { loggedOut, tokensReceived } from '../slices/authSlice';
import { baseApi } from './baseApi';
import { C, P, req } from './services';

// voice-auth-be: sign-in for both realms (Postman "Auth - Platform Admin" /
// "Auth - Customer"), plus the documented gap routes for account access,
// API keys, privacy settings and sub-accounts.

export const authApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Sign-in ---------------------------------------------------------
    login: b.mutation({
      query: ({ realm, email, password }) => P.auth(`/auth/${realm}/login`, { method: 'POST', body: { email, password } }),
      async onQueryStarted({ realm }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(tokensReceived({ realm, tokens: data }));
        } catch {
          /* error is shown by the form */
        }
      },
    }),
    logout: b.mutation({
      query: ({ realm, refresh_token }) => req('auth', realm)(`/auth/${realm}/logout`, { method: 'POST', body: { refresh_token } }),
      async onQueryStarted({ realm }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          /* the local session ends regardless */
        }
        dispatch(loggedOut(realm));
        dispatch(baseApi.util.resetApiState());
      },
    }),
    getMe: b.query({
      query: (realm) => req('auth', realm)(`/${realm}/me`),
      providesTags: (_r, _e, realm) => [{ type: 'Me', id: realm }],
    }),

    // Account access (CUS-02, CUS-09) ---------------------------------
    getInviteInfo: b.query({ query: (token) => P.auth(`/auth/customer/invites/${token}`) }),
    acceptInvite: b.mutation({
      query: (body) => P.auth('/auth/customer/accept-invite', { method: 'POST', body }),
      async onQueryStarted(_a, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data?.access_token) dispatch(tokensReceived({ realm: 'customer', tokens: data }));
        } catch {
          /* shown by the form */
        }
      },
    }),
    forgotPassword: b.mutation({ query: (email) => P.auth('/auth/customer/forgot-password', { method: 'POST', body: { email } }) }),
    resetPassword: b.mutation({ query: (body) => P.auth('/auth/customer/reset-password', { method: 'POST', body }) }),
    changePassword: b.mutation({ query: (body) => C.auth('/customer/me/change-password', { method: 'POST', body }) }),
    signup: b.mutation({ query: (body) => P.auth('/auth/customer/signup', { method: 'POST', body }) }),
    verifyEmail: b.mutation({
      query: (token) => P.auth('/auth/customer/verify-email', { method: 'POST', body: { token } }),
      async onQueryStarted(_a, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data?.access_token && data.refresh_token) dispatch(tokensReceived({ realm: 'customer', tokens: data }));
        } catch {
          /* shown by the page */
        }
      },
    }),
    listTenantPermissions: b.query({ query: () => C.auth('/customer/permissions'), providesTags: ['Permission'] }),
    resendInvite: b.mutation({ query: (userId) => C.auth(`/customer/staff/${userId}/resend-invite`, { method: 'POST', body: {} }) }),

    // API keys (DEV-01) -----------------------------------------------
    listApiKeys: b.query({ query: () => C.auth('/customer/api-keys'), providesTags: ['ApiKey'] }),
    createApiKey: b.mutation({ query: (body) => C.auth('/customer/api-keys', { method: 'POST', body }), invalidatesTags: ['ApiKey'] }),
    revokeApiKey: b.mutation({ query: (id) => C.auth(`/customer/api-keys/${id}`, { method: 'DELETE' }), invalidatesTags: ['ApiKey'] }),

    // Privacy (CMP-02) -------------------------------------------------
    getPrivacy: b.query({ query: () => C.auth('/customer/privacy-settings'), providesTags: ['Privacy'] }),
    putPrivacy: b.mutation({ query: (body) => C.auth('/customer/privacy-settings', { method: 'PUT', body }), invalidatesTags: ['Privacy'] }),
    privacyDeleteRequest: b.mutation({ query: (phone) => C.auth('/customer/privacy/delete-request', { method: 'POST', body: { phone } }) }),

    // Sub-accounts (EXT-04) -------------------------------------------
    listSubAccounts: b.query({ query: () => C.auth('/customer/sub-accounts'), providesTags: ['SubAccount'] }),
    createSubAccount: b.mutation({ query: (body) => C.auth('/customer/sub-accounts', { method: 'POST', body }), invalidatesTags: ['SubAccount'] }),
    switchSubAccount: b.mutation({
      query: (id) => C.auth(`/customer/sub-accounts/${id}/switch`, { method: 'POST', body: {} }),
      async onQueryStarted(_a, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(tokensReceived({ realm: 'customer', tokens: data }));
          dispatch(baseApi.util.resetApiState());
        } catch {
          /* shown by the page */
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useGetInviteInfoQuery,
  useAcceptInviteMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useSignupMutation,
  useVerifyEmailMutation,
  useListTenantPermissionsQuery,
  useResendInviteMutation,
  useListApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useGetPrivacyQuery,
  usePutPrivacyMutation,
  usePrivacyDeleteRequestMutation,
  useListSubAccountsQuery,
  useCreateSubAccountMutation,
  useSwitchSubAccountMutation,
} = authApi;
