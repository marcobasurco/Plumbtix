// =============================================================================
// Work Orders — Welcome Tour (Onboarding)
// =============================================================================
// Short welcome tour for new users after accepting an invite.
// Highlights how to create a ticket and view status.
// Uses react-joyride for step-by-step guided tour.
// =============================================================================

import { useState, useEffect } from 'react';
import Joyride, { type Step, type CallBackProps, STATUS } from 'react-joyride';
import { useAuth } from '@/lib/auth';

const TOUR_COMPLETED_KEY = 'plumbtix_tour_completed';

const TOUR_STEPS: Step[] = [
  {
    target: '.sidebar-nav',
    content: 'Welcome to PlumbTix! Use the sidebar to navigate between different sections of the app.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: 'a[href*="tickets"]',
    content: 'View all your work orders here. You can filter by status, severity, building, and more.',
    placement: 'right',
  },
  {
    target: 'a[href*="tickets/new"], button:has-text("New Ticket")',
    content: 'Create a new work order by clicking "New Ticket". You\'ll select a building, describe the issue, and set the priority.',
    placement: 'bottom',
  },
  {
    target: 'a[href*="buildings"]',
    content: 'Manage your buildings, units, and occupants here.',
    placement: 'right',
  },
  {
    target: '.content-header',
    content: 'You\'re all set! Check the notification bell for updates on your tickets. Need help? Contact dispatch@proroto.com.',
    placement: 'bottom',
  },
];

export function WelcomeTour() {
  const { session } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!session) return;

    // Check if tour was already completed
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY);
    if (completed) return;

    // Check if this is a new user (accepted invite in last 5 minutes)
    const params = new URLSearchParams(window.location.search);
    const justOnboarded = params.get('onboarded') === 'true';

    if (justOnboarded) {
      // Small delay to let the UI render
      const timer = setTimeout(() => setRun(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [session]);

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: '#2563eb',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 12,
          fontSize: 14,
        },
        buttonNext: {
          borderRadius: 8,
          padding: '8px 16px',
        },
        buttonBack: {
          marginRight: 8,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
}
