import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/Shell';
import { ToastProvider } from './components/ui';
import { RealmProvider } from './lib/auth';
import { LoginPage } from './pages/auth/LoginPage';
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage, SignupPage, VerifyEmailPage, WelcomePage } from './pages/auth/AccountAccessPages';
import { CustomerLayout } from './pages/customer/CustomerLayout';
import { HomePage } from './pages/customer/HomePage';
import { DocsPage } from './pages/customer/DocsPage';
import { AgentsPage } from './pages/customer/agents/AgentsPage';
import { NewAgentPage } from './pages/customer/agents/NewAgentPage';
import { AgentEditor } from './pages/customer/agents/AgentEditor';
import { CompanyProfilePage } from './pages/customer/build/CompanyProfilePage';
import { ToolsPage } from './pages/customer/build/ToolsPage';
import { WorkflowsPage } from './pages/customer/workflows/WorkflowsPage';
import { KnowledgeDetailPage, KnowledgeListPage } from './pages/customer/knowledge/KnowledgePages';
import { NumberRoutingPage, NumbersPage } from './pages/customer/numbers/NumbersPages';
import { CallDetailPage, CallsPage, InboundPage, LiveCallsPage, ReviewPage } from './pages/customer/calls/CallsPages';
import { CampaignDetailPage, CampaignsPage, CampaignWizard } from './pages/customer/campaigns/CampaignPages';
import { ContactDetailPage, ContactsPage } from './pages/customer/contacts/ContactsPages';
import { DevelopersPage } from './pages/customer/developers/DevelopersPage';
import { AnalyticsPage } from './pages/customer/analytics/AnalyticsPage';
import { IntegrationDetailPage, IntegrationsPage } from './pages/customer/integrations/IntegrationsPages';
import { BroadcastsPage, InboxPage, WhatsAppPage } from './pages/customer/channels/ChannelsPages';
import { SettingsLayout } from './pages/customer/settings/SettingsLayout';
import { ProfilePage } from './pages/customer/settings/ProfilePage';
import { RolesPage, TeamPage } from './pages/customer/settings/TeamPages';
import { InvoiceDetailPage, InvoicesPage, PaymentMethodsPage, PlanPage, UsagePage } from './pages/customer/settings/BillingPages';
import {
  ActivityLogPage,
  CallingRulesPage,
  CreditsPage,
  DoNotCallPage,
  ExportsPage,
  NotificationSettingsPage,
  PrivacyPage,
  PronunciationsPage,
  SubAccountsPage,
  VoicesPage,
} from './pages/customer/settings/MoreSettings';
import { AdminLayout } from './pages/admin/AdminLayout';
import { CustomersPage } from './pages/admin/CustomersPage';
import { CustomerDetailPage } from './pages/admin/CustomerDetailPage';
import { PackagesPage } from './pages/admin/PackagesPage';
import { AdminProfilePage, AdminRolesPage, AdminStaffPage } from './pages/admin/TeamPages';
import { AdminAuditPage, AdminOverviewPage, NumberPoolPage, TemplatesAdminPage } from './pages/admin/AdminExtraPages';

function Realm({ realm }) {
  return (
    <RealmProvider realm={realm}>
      <Outlet />
    </RealmProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* Platform admin console (ADM-*) */}
          <Route path="/admin" element={<Realm realm="admin" />}>
            <Route path="login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth loginPath="/admin/login">
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AdminOverviewPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="packages" element={<PackagesPage />} />
              <Route path="numbers" element={<NumberPoolPage />} />
              <Route path="templates" element={<TemplatesAdminPage />} />
              <Route path="staff" element={<AdminStaffPage />} />
              <Route path="roles" element={<AdminRolesPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
              <Route path="profile" element={<AdminProfilePage />} />
              <Route path="*" element={<Navigate to="overview" replace />} />
            </Route>
          </Route>

          {/* Customer dashboard (CUS-* and every product module) */}
          <Route element={<Realm realm="customer" />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset/:token" element={<ResetPasswordPage />} />
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
            <Route
              element={
                <RequireAuth loginPath="/login">
                  <CustomerLayout />
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="welcome" element={<WelcomePage />} />

              {/* Build */}
              <Route path="build" element={<NewAgentPage hub />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/new" element={<NewAgentPage />} />
              <Route path="agents/:id" element={<AgentEditor />} />
              <Route path="agents/:id/:tab" element={<AgentEditor />} />
              <Route path="company" element={<CompanyProfilePage />} />
              <Route path="tools" element={<ToolsPage />} />
              <Route path="workflows" element={<WorkflowsPage />} />
              <Route path="knowledge" element={<KnowledgeListPage />} />
              <Route path="knowledge/:id" element={<KnowledgeDetailPage />} />

              {/* Deploy */}
              <Route path="numbers" element={<NumbersPage />} />
              <Route path="numbers/:id" element={<NumberRoutingPage />} />
              <Route path="inbound" element={<InboundPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="campaigns/new" element={<CampaignWizard />} />
              <Route path="campaigns/:id" element={<CampaignDetailPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="contacts/:id" element={<ContactDetailPage />} />
              <Route path="developers" element={<DevelopersPage />} />

              {/* Connect */}
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="integrations/:provider" element={<IntegrationDetailPage />} />
              <Route path="channels/whatsapp" element={<WhatsAppPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="broadcasts" element={<BroadcastsPage />} />

              {/* Monitor */}
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route path="calls/live" element={<LiveCallsPage />} />
              <Route path="calls/:id" element={<CallDetailPage />} />
              <Route path="review" element={<ReviewPage />} />
              <Route path="docs" element={<DocsPage />} />

              {/* Account */}
              <Route path="settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="plan" element={<PlanPage />} />
                <Route path="usage" element={<UsagePage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="payment-methods" element={<PaymentMethodsPage />} />
                <Route path="credits" element={<CreditsPage />} />
                <Route path="do-not-call" element={<DoNotCallPage />} />
                <Route path="calling-rules" element={<CallingRulesPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="activity" element={<ActivityLogPage />} />
                <Route path="notifications" element={<NotificationSettingsPage />} />
                <Route path="pronunciations" element={<PronunciationsPage />} />
                <Route path="voices" element={<VoicesPage />} />
                <Route path="exports" element={<ExportsPage />} />
                <Route path="sub-accounts" element={<SubAccountsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
