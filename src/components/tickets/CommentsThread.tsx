import { useEffect, useState, type FormEvent } from 'react';
import { getTicketComments, createComment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
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
      await loadComments(); // Refresh from server
    } else {
      setPostError(result.error.message);
    }
    setPosting(false);
  };

  return (
    <div>
      <h3 style={sectionTitle}>
        Comments
        {comments.length > 0 && <span style={{ fontWeight: 400, color: '#9ca3af' }}> ({comments.length})</span>}
      </h3>

      {/* Comment list */}
      {loading ? (
        <p style={mutedStyle}>Loading comments…</p>
      ) : error ? (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      ) : comments.length === 0 ? (
        <p style={mutedStyle}>No comments yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {comments.map((c) => (
            <div key={c.id} style={{
              ...commentBox,
              ...(c.is_internal ? internalStyle : {}),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>{c.author.full_name}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '6px' }}>
                    {ROLE_LABELS[c.author.role as keyof typeof ROLE_LABELS] ?? c.author.role}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {formatDateTime(c.created_at)}
                </span>
              </div>
              {c.is_internal && (
                <span style={internalBadge}>Internal</span>
              )}
              <p style={{ margin: '4px 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                {c.comment_text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Compose */}
      <form onSubmit={handleSubmit} style={{ marginTop: '8px' }}>
        <ErrorBanner message={postError} onDismiss={() => setPostError(null)} />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          style={textareaStyle}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <div>
            {isAdmin && (
              <label style={{ fontSize: '0.8rem', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
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

// Styles
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const commentBox: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '6px',
  border: '1px solid #e5e7eb', background: '#fff',
};
const internalStyle: React.CSSProperties = {
  background: '#fffbeb', border: '1px solid #fde68a',
};
const internalBadge: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.65rem', fontWeight: 700,
  textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px',
  background: '#fef3c7', color: '#92400e', marginTop: '4px',
};
const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: '8px',
  fontSize: '1rem', fontFamily: 'inherit',
  resize: 'vertical', minHeight: '80px',
};
