import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DashboardOverview } from '@/components/DashboardOverview';
import { TicketList } from '@/components/tickets/TicketList';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { CreateTicketWizard } from '@/components/tickets/CreateTicketWizard';
import { BuildingList } from '@/components/buildings/BuildingList';
import { BuildingDetail } from '@/components/buildings/BuildingDetail';
import { BuildingForm } from '@/components/buildings/BuildingForm';
import { AnalyticsPage } from '@/components/admin/AnalyticsPage';

export function PMDashboard() {
  return (
    <DashboardLayout title="Property Manager">
      <Routes>
        <Route index element={<DashboardOverview />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/new" element={<CreateTicketWizard />} />
        <Route path="tickets/:ticketId" element={<TicketDetail />} />
        <Route path="buildings" element={<BuildingList />} />
        <Route path="buildings/new" element={<BuildingForm />} />
        <Route path="buildings/:buildingId" element={<BuildingDetail />} />
        <Route path="buildings/:buildingId/edit" element={<BuildingForm />} />
        <Route path="analytics" element={<AnalyticsPage />} />
      </Routes>
    </DashboardLayout>
  );
}
