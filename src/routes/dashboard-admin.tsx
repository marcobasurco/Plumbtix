import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DashboardOverview } from '@/components/DashboardOverview';
import { TicketList } from '@/components/tickets/TicketList';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { CreateTicketWizard } from '@/components/tickets/CreateTicketWizard';
import { BuildingList } from '@/components/buildings/BuildingList';
import { BuildingDetail } from '@/components/buildings/BuildingDetail';
import { BuildingForm } from '@/components/buildings/BuildingForm';
import { CompanyList } from '@/components/admin/CompanyList';
import { CompanyDetail } from '@/components/admin/CompanyDetail';
import { UsersPage } from '@/components/admin/UsersPage';
import { DispatchBoard } from '@/components/admin/DispatchBoard';
import { AnalyticsPage } from '@/components/admin/AnalyticsPage';
import { ImportPage } from '@/components/admin/ImportPage';
import { ReportingDashboard } from '@/components/admin/ReportingDashboard';
import { SettingsPage } from '@/components/SettingsPage';

export function AdminDashboard() {
  return (
    <DashboardLayout title="Pro Roto Admin">
      <Routes>
        <Route index element={<DashboardOverview />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/new" element={<CreateTicketWizard />} />
        <Route path="tickets/:ticketId" element={<TicketDetail />} />
        <Route path="buildings" element={<BuildingList />} />
        {/* proroto_admin can create buildings directly (will be asked to pick company) */}
        <Route path="buildings/new" element={<BuildingForm />} />
        <Route path="buildings/:buildingId" element={<BuildingDetail />} />
        <Route path="buildings/:buildingId/edit" element={<BuildingForm />} />
        <Route path="companies" element={<CompanyList />} />
        <Route path="companies/:companyId" element={<CompanyDetail />} />
        <Route path="companies/:companyId/buildings/new" element={<BuildingForm />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="dispatch" element={<DispatchBoard />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="reports" element={<ReportingDashboard />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </DashboardLayout>
  );
}
