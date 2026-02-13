import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Wrench, Ticket, Building2, Bell } from 'lucide-react';

const STEPS = [
  { icon: Wrench, title: 'Welcome to PlumbTix', body: 'Manage work orders, track tickets, and keep your buildings maintained — all in one place.' },
  { icon: Ticket, title: 'Create Tickets', body: 'Submit work orders quickly with our step-by-step wizard. Add photos, set severity, and track progress.' },
  { icon: Building2, title: 'Manage Buildings', body: 'View your properties, units, and common areas. Everything is organized by building.' },
  { icon: Bell, title: 'Stay Notified', body: 'Get real-time notifications when tickets are updated. Never miss an important change.' },
];

export function WelcomeTour() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (params.get('onboarded') === 'true' && !localStorage.getItem('plumbtix_tour_completed')) {
      setShow(true);
    }
  }, [params]);

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  const dismiss = () => {
    localStorage.setItem('plumbtix_tour_completed', 'true');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-in">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{current.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{current.body}</p>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <div className="flex w-full gap-2">
            {step > 0 && (
              <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button className="flex-1" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button className="flex-1" onClick={dismiss}>Get Started</Button>
            )}
          </div>
          {step === 0 && (
            <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">Skip tour</button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
