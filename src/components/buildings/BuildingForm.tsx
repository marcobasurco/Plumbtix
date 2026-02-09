// =============================================================================
// PlumbTix — Building Form (page route wrapper)
// =============================================================================
// Renders BuildingFormDialog in "always open" mode for route-based navigation.
// Used by:
//   /buildings/new              (pm_admin, proroto_admin)
//   /buildings/:buildingId/edit (pm_admin, proroto_admin)
//   /companies/:companyId/buildings/new (proroto_admin from CompanyDetail)
// =============================================================================

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { BuildingFormDialog } from './BuildingFormDialog';

export function BuildingForm() {
  const { buildingId, companyId: routeCompanyId } = useParams<{
    buildingId: string;
    companyId: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { companyId: authCompanyId, role } = useAuth();

  // Company ID: route param > query param (?companyId=) > auth context
  const targetCompanyId =
    routeCompanyId || searchParams.get('companyId') || authCompanyId;

  const handleClose = () => {
    navigate('..', { replace: true });
  };

  const handleSaved = () => {
    // After save, navigate to the appropriate list
    if (buildingId) {
      navigate('..', { replace: true }); // back to building detail
    } else {
      const basePath = role === 'proroto_admin' ? '/admin' : '/dashboard';
      navigate(`${basePath}/buildings`, { replace: true });
    }
  };

  return (
    <BuildingFormDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      buildingId={buildingId}
      companyId={targetCompanyId}
      onSaved={handleSaved}
    />
  );
}
