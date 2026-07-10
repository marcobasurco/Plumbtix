import { Button } from '@/components/ui/button';
import { Printer, Download, ArrowLeft, RefreshCw } from 'lucide-react';

/** Screen-only action bar — excluded from print output via print:hidden. */
export function PrintActions({ onBack, onRegenerate }:
  { onBack?: () => void; onRegenerate?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {onBack && (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to reports
        </Button>
      )}
      <div className="ml-auto flex gap-2">
        {onRegenerate && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onRegenerate}>
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>
    </div>
  );
}
