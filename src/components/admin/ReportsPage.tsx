import { useState } from 'react';
import { ReportingDashboard } from './ReportingDashboard';
import { EquipmentRegister } from './EquipmentRegister';
import { BarChart3, Wrench } from 'lucide-react';

const TABS = [
  { key: 'tickets', label: 'Ticket Reports', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'equipment', label: 'Equipment Register', icon: <Wrench className="h-4 w-4" /> },
] as const;

export function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('tickets');
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
      {tab === 'tickets' ? <ReportingDashboard /> : <EquipmentRegister />}
    </div>
  );
}
