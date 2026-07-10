import { useState } from 'react';
import { ReportingDashboard } from './ReportingDashboard';
import { EquipmentRegister } from './EquipmentRegister';
import { TicketReportDocument } from './TicketReportDocument';
import { BarChart3, FileText, Wrench } from 'lucide-react';

const TABS = [
  { key: 'dashboard', label: 'Ticket Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'ticket-doc', label: 'Ticket Report (Print)', icon: <FileText className="h-4 w-4" /> },
  { key: 'equipment', label: 'Equipment Register', icon: <Wrench className="h-4 w-4" /> },
] as const;

export function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('dashboard');
  return (
    <div className="space-y-5">
      <div className="company-tabs print:hidden">
        {TABS.map(t => (
          <button key={t.key} className={`company-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <ReportingDashboard />}
      {tab === 'ticket-doc' && <TicketReportDocument />}
      {tab === 'equipment' && <EquipmentRegister />}
    </div>
  );
}
