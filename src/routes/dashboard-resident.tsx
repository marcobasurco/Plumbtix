import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DashboardOverview } from '@/components/DashboardOverview';
import { TicketList } from '@/components/tickets/TicketList';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { CreateTicketWizard } from '@/components/tickets/CreateTicketWizard';
import { BuildingList } from '@/components/buildings/BuildingList';
import { BuildingDetail } from '@/components/buildings/BuildingDetail';

export function ResidentDashboard() {
  return (
    <DashboardLayout title="My Work Orders">
      <Routes>
        <Route index element={<DashboardOverview />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/new" element={<CreateTicketWizard />} />
        <Route path="tickets/:ticketId" element={<TicketDetail />} />
        <Route path="buildings" element={<BuildingList />} />
        <Route path="buildings/:buildingId" element={<BuildingDetail />} />
      </Routes>
    </DashboardLayout>
  );
}
