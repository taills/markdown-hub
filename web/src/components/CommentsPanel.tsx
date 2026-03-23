import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { commentService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { Comment } from '@/types';

interface CommentsPanelProps {
  documentId: string;
  headingAnchor?: string;
  onClose?: () => void;
}

export function CommentsPanel({ documentId, headingAnchor, onClose }: CommentsPanelProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const handleCloseError = () => setError('');

  const loadComments = useCallback(() => {
    setIsLoading(true);
    commentService
      .list(documentId)
      .then((c) => {
        // Filter by heading anchor if provided
        if (headingAnchor) {
          setComments(c.filter((comment) => comment.heading_anchor === headingAnchor));
        } else {
          setComments(c.filter((comment) => !comment.heading_anchor));
        }
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, [documentId, headingAnchor]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSaving(true);
    setError('');
    try {
      await commentService.create(documentId, {
        content: newComment.trim(),
        heading_anchor: headingAnchor,
      });
      setNewComment('');
      loadComments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return;
    setSaving(true);
    setError('');
    try {
      await commentService.update(commentId, editContent.trim());
      setEditingId(null);
      setEditContent('');
      loadComments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm(t('comments.confirmDelete'))) return;
    setError('');
    try {
      await commentService.delete(commentId);
      loadComments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    setSaving(true);
    setError('');
    try {
      await commentService.create(documentId, {
        content: replyContent.trim(),
        heading_anchor: headingAnchor,
        parent_id: parentId,
      });
      setReplyingTo(null);
      setReplyContent('');
      loadComments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`comment-item ${isReply ? 'comment-reply' : ''}`}>
      <div className="comment-header">
        <span className="comment-author">{comment.author_username || comment.author_id}</span>
        <span className="comment-date">{formatDate(comment.created_at)}</span>
      </div>
      {editingId === comment.id ? (
        <div className="comment-edit-form">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
          />
          <div className="comment-edit-actions">
            <button onClick={() => handleUpdate(comment.id)} disabled={saving}>
              {t('common.save')}
            </button>
            <button onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="comment-content">{comment.content}</div>
      )}
      {!editingId && (
        <div className="comment-actions">
          {!isReply && (
            <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}>
              {t('comments.reply')}
            </button>
          )}
          <button onClick={() => {
            setEditingId(comment.id);
            setEditContent(comment.content);
          }}>
            {t('common.edit')}
          </button>
          <button onClick={() => handleDelete(comment.id)} className="delete-btn">
            {t('common.delete')}
          </button>
        </div>
      )}
      {replyingTo === comment.id && (
        <div className="reply-form">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder={t('comments.replyPlaceholder')}
            rows={2}
          />
          <div className="reply-actions">
            <button onClick={() => handleReply(comment.id)} disabled={saving || !replyContent.trim()}>
              {t('comments.submitReply')}
            </button>
            <button onClick={() => setReplyingTo(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => renderComment(reply, true))}
        </div>
      )}
    </div>
  );

  return (
    <div className="comments-panel">
      <div className="comments-panel-header">
        <h3>{headingAnchor ? t('comments.headingComments') : t('comments.title')}</h3>
        {onClose && <button onClick={onClose} className="close-btn">&times;</button>}
      </div>
      {isLoading ? (
        <p>{t('comments.loading')}</p>
      ) : (
        <div className="comments-list">
          {comments.length === 0 ? (
            <p className="empty">{t('comments.empty')}</p>
          ) : (
            comments.map((comment) => renderComment(comment))
          )}
        </div>
      )}
      <form className="add-comment-form" onSubmit={handleSubmit}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('comments.placeholder')}
          rows={3}
        />
        <button type="submit" disabled={saving || !newComment.trim()}>
          {saving ? t('comments.submitting') : t('comments.submit')}
        </button>
      </form>
      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}
