// =============================================================================
// Work Orders — Welcome Tour (Onboarding)
// =============================================================================
// Custom step-by-step tour for new users after accepting an invite.
// Pure React + Tailwind — no external tour library needed.
// =============================================================================

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft, Ticket, Building2, Bell, Wrench } from 'lucide-react';

const TOUR_COMPLETED_KEY = 'plumbtix_tour_completed';

interface TourStep {
  title: string;
  content: string;
  icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to PlumbTix!',
    content: 'Use the sidebar on the left to navigate between sections — Tickets, Buildings, Analytics, and more.',
    icon: <Wrench className="h-6 w-6 text-primary" />,
  },
  {
    title: 'View & Create Tickets',
    content: 'Head to Tickets to see all work orders. Click "New Ticket" to submit a new plumbing request — select a building, describe the issue, and set the priority.',
    icon: <Ticket className="h-6 w-6 text-blue-500" />,
  },
  {
    title: 'Manage Buildings',
    content: 'The Buildings section shows all properties. You can view units, occupants, and create tickets directly from any building.',
    icon: <Building2 className="h-6 w-6 text-green-500" />,
  },
  {
    title: 'Stay Updated',
    content: 'Check the bell icon in the header for real-time notifications when ticket statuses change or new comments are added. You\'re all set!',
    icon: <Bell className="h-6 w-6 text-orange-500" />,
  },
];

export function WelcomeTour() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!session) return;

    const completed = localStorage.getItem(TOUR_COMPLETED_KEY);
    if (completed) return;

    const params = new URLSearchParams(window.location.search);
    const justOnboarded = params.get('onboarded') === 'true';

    if (justOnboarded) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [session]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={dismiss} />

      {/* Tour Card */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[90vw] max-w-md">
        <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2.5">
              {current.icon}
              <span className="text-base font-bold">{current.title}</span>
            </div>
            <button onClick={dismiss} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-3 text-sm text-muted-foreground leading-relaxed">
            {current.content}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {step < TOUR_STEPS.length - 1 ? (
                  <>Next <ChevronRight className="h-3.5 w-3.5 ml-1" /></>
                ) : (
                  'Get Started'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
