import { useEffect, useState, type FormEvent } from 'react';
import { getTicketComments, createComment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare } from 'lucide-react';
import { ROLE_LABELS } from '@shared/types/enums';

interface CommentEntry {
  id: string;
  ticket_id: string;
  user_id: string;
  comment_text: string;
  is_internal: boolean;
  created_at: string;
  author: {
    id: string;
    full_name: string;
    role: string;
  };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

interface CommentsThreadProps {
  ticketId: string;
}

export function CommentsThread({ ticketId }: CommentsThreadProps) {
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose state
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    const result = await getTicketComments(ticketId);
    if (result.ok) {
      setComments(result.data.comments as CommentEntry[]);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setPosting(true);
    setPostError(null);

    const result = await createComment({
      ticket_id: ticketId,
      comment_text: text.trim(),
      is_internal: isAdmin ? isInternal : undefined,
    });

    if (result.ok) {
      setText('');
      setIsInternal(false);
      await loadComments();
    } else {
      setPostError(result.error.message);
    }
    setPosting(false);
  };

  return (
    <div>
      <h3 className="text-base font-semibold mb-3 pb-2 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Comments
        {comments.length > 0 && (
          <span className="font-normal text-muted-foreground"> ({comments.length})</span>
        )}
      </h3>

      {/* Comment list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : error ? (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`px-3.5 py-2.5 rounded-md border text-foreground ${
                c.is_internal
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex justify-between items-baseline flex-wrap gap-1">
                <div>
                  <strong className="text-sm">{c.author.full_name}</strong>
                  <span className="text-xs text-muted-foreground ml-1.5">
                    {ROLE_LABELS[c.author.role as keyof typeof ROLE_LABELS] ?? c.author.role}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(c.created_at)}
                </span>
              </div>
              {c.is_internal && (
                <span className="inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 mt-1">
                  Internal
                </span>
              )}
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {c.comment_text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Compose */}
      <form onSubmit={handleSubmit} className="mt-2">
        <ErrorBanner message={postError} onDismiss={() => setPostError(null)} />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-[inherit] resize-y min-h-[80px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />

        <div className="flex items-center justify-between mt-2">
          <div>
            {isAdmin && (
              <label className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="accent-primary"
                />
                Internal note (only visible to Pro Roto)
              </label>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={posting || !text.trim()}
          >
            {posting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting…</>
            ) : isInternal ? 'Post Internal Note' : 'Post Comment'}
          </Button>
        </div>
      </form>
    </div>
  );
}
