import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/hooks/useAuth';
import { useSiteTitle } from '@/hooks/useSiteTitle';
import { useDocument, useDocumentList } from '@/hooks/useDocument';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useImagePaste } from '@/hooks/useImagePaste';
import { useToast } from '@/components/Toast';
import { attachmentService, documentService, workspaceService } from '@/services/api';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { PermissionsPanel } from '@/components/PermissionsPanel';
import { AttachmentPanel } from '@/components/AttachmentPanel';
import { WorkspaceSettingsPanel } from '@/components/WorkspaceSettingsPanel';
import { SearchModal } from '@/components/SearchModal';
import { ErrorModal } from '@/components/ErrorModal';
import { applyLinePatch, createLinePatch } from '@/utils/linePatch';
import type { Attachment, DocumentListItem, Workspace, WSMessage } from '@/types';

// ---------------------------------------------------------------------------
// Sortable sub-components
// ---------------------------------------------------------------------------

function SortableWorkspaceItem({
  ws,
  isActive,
  onSelect,
  onSettings,
  settingsLabel,
}: {
  ws: Workspace;
  isActive: boolean;
  onSelect: () => void;
  onSettings: () => void;
  settingsLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ws.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`workspace-item ${isActive ? 'active' : ''}`}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="拖拽排序"
      >
        ⋮⋮
      </button>
      <button className="workspace-main" onClick={onSelect}>
        <span className="workspace-name">{ws.name}</span>
      </button>
      <div className="workspace-actions">
        <button className="workspace-settings-btn" title={settingsLabel} onClick={onSettings} aria-label={settingsLabel}>
          ⚙️
        </button>
      </div>
    </div>
  );
}

function SortableDocumentItem({
  doc,
  isActive,
  isOwner,
  workspaceName,
  locale,
  onNavigate,
  onDelete,
}: {
  doc: DocumentListItem;
  isActive: boolean;
  isOwner: boolean;
  workspaceName: string;
  locale: string;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`document-item ${isActive ? 'active' : ''}`}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="拖拽排序"
      >
        ⋮⋮
      </button>
      <button className="doc-main" onClick={onNavigate}>
        <span className="doc-title">{doc.title}</span>
        <span className="doc-meta">
          <span>{workspaceName}</span>
          <span className="doc-meta-sep">·</span>
          <span>{new Date(doc.updated_at).toLocaleDateString(locale)}</span>
        </span>
      </button>
      {isOwner && (
        <div className="doc-actions">
          <button className="doc-delete" onClick={onDelete} aria-label="删除文档">
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Panel = 'preview' | 'history' | 'permissions' | 'attachments';

type Column = 'workspace' | 'documents' | 'preview';

type ResizableColumn = 'workspace' | 'documents' | 'preview';

const RESIZER_WIDTH = 6;
const MIN_EDITOR_WIDTH = 420;
const MIN_WIDTHS: Record<ResizableColumn, number> = {
  workspace: 180,
  documents: 220,
  preview: 260,
};

export function NotesLayout() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const { siteTitle } = useSiteTitle();
  const { showToast } = useToast();
  const { documents, setDocuments, isLoading: docsLoading, reload } = useDocumentList();
  const { document, setDocument, isLoading: docLoading, error: documentError } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [mode, setMode] = useState<'edit' | 'settings'>('edit');
  const [visibleColumns, setVisibleColumns] = useState<Record<Column, boolean>>({
    workspace: true,
    documents: true,
    preview: true,
  });
  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumn, number>>({
    workspace: 240,
    documents: 300,
    preview: 360,
  });
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');
  const lastSyncedContentRef = useRef('');
  const resizeRef = useRef<{
    type: ResizableColumn;
    startX: number;
    startWidths: Record<ResizableColumn, number>;
  } | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [createDocError, setCreateDocError] = useState('');
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [publicToggling, setPublicToggling] = useState(false);
  const [dismissedDocError, setDismissedDocError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const docErrorToShow = documentError && documentError !== dismissedDocError ? documentError : '';
  const modalError = titleError || workspaceError || createDocError || docErrorToShow;
  const handleCloseError = () => {
    if (documentError) setDismissedDocError(documentError);
    setTitleError('');
    setWorkspaceError('');
    setCreateDocError('');
  };

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;
    setWorkspaceLoading(true);
    workspaceService
      .list()
      .then((data) => {
        if (!isMounted) return;
        setWorkspaces(data ?? []);
        const initialId = data?.[0]?.id || '';
        setSelectedWorkspaceId((prev) => prev || initialId);
      })
      .catch((e: Error) => setWorkspaceError(e.message))
      .finally(() => setWorkspaceLoading(false));
    return () => {
      isMounted = false;
    };
  }, []);

  const setContentFromServer = useCallback((nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
    lastSyncedContentRef.current = nextContent;
  }, []);

  const setContentLocal = useCallback((nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
  }, []);

  useEffect(() => {
    if (document) setContentFromServer(document.content);
    if (!document) setContentFromServer('');
  }, [document, setContentFromServer]);

  useEffect(() => {
    if (!document) {
      setTitleDraft('');
      setIsEditingTitle(false);
      setTitleError('');
      return;
    }
    setTitleDraft(document.title);
    setIsEditingTitle(false);
    setTitleError('');
  }, [document?.id, document?.title]);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'init' || msg.type === 'update') {
      if (msg.content !== undefined) setContentFromServer(msg.content);
    }
    if (msg.type === 'patch' && msg.payload) {
      const nextContent = applyLinePatch(contentRef.current, msg.payload);
      setContentFromServer(nextContent);
    }
    if ((msg.type === 'update' || msg.type === 'patch') && msg.user_id && msg.user_id !== user?.id) {
      setCollaborators((prev) =>
        prev.includes(msg.user_id!) ? prev : [...prev, msg.user_id!]
      );
    }
  }, [setContentFromServer, user?.id]);

  const { send, connectionState: wsState } = useWebSocket({
    documentId: id ?? '',
    token: token ?? '',
    onMessage: handleWSMessage,
  });

  useEffect(() => {
    setConnectionState(wsState);
  }, [wsState]);

  const sendPendingPatch = useCallback(() => {
    if (!id) return;
    const patch = createLinePatch(lastSyncedContentRef.current, contentRef.current);
    if (!patch) return;
    send({ type: 'patch', payload: patch });
    lastSyncedContentRef.current = contentRef.current;
  }, [id, send]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContentLocal(newContent);
      if (!id) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(sendPendingPatch, 500);
    },
    [id, sendPendingPatch, setContentLocal]
  );

  const handleInsertAttachment = useCallback(async (attachment: Attachment) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const isImage = attachment.file_type?.startsWith('image/');
    const label = attachment.filename || 'attachment';
    const downloadUrl = attachment.document_id
      ? `/api/attachments/${attachment.id}/download`
      : `/api/workspace-attachments/${attachment.id}/download`;
    const markdown = isImage
      ? `![${label}](${attachment.file_path})`
      : `[${label}](${downloadUrl})`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      content.substring(0, start) + markdown + content.substring(end);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setContentLocal(newContent);
    sendPendingPatch();

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, [content, id, send]);

  const { attachPasteListener } = useImagePaste({
    onImagePaste: async ({ file }) => {
      if (!id) return;
      try {
        const attachment = await attachmentService.upload(id, file);
        const imageMD = `![${file.name}](${attachment.file_path})`;
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newContent =
            content.substring(0, start) + imageMD + content.substring(end);
          handleContentChange(newContent);
        }
      } catch (err) {
        console.error('Failed to upload pasted image:', err);
      }
    },
  });

  useEffect(() => {
    if (textareaRef.current) {
      return attachPasteListener(textareaRef.current);
    }
  }, [attachPasteListener]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!id) return;
        sendPendingPatch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, sendPendingPatch]);

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    workspaces.forEach((ws) => map.set(ws.id, ws));
    return map;
  }, [workspaces]);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((ws) => ws.id === selectedWorkspaceId);
  }, [workspaces, selectedWorkspaceId]);

  const handleWorkspaceUpdated = useCallback((updated: { id: string; name: string; is_public: boolean }) => {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === updated.id ? { ...ws, name: updated.name, is_public: updated.is_public } : ws))
    );
  }, []);

  const handleWorkspaceDeleted = useCallback(() => {
    setSelectedWorkspaceId('');
    setWorkspaces((prev) => prev.filter((ws) => ws.id !== selectedWorkspaceId));
  }, [selectedWorkspaceId]);

  const filteredDocuments = useMemo(() => {
    if (showAllWorkspaces || !selectedWorkspaceId) return documents;
    return (documents ?? []).filter((doc) => doc.workspace_id === selectedWorkspaceId);
  }, [documents, selectedWorkspaceId, showAllWorkspaces]);

  const activeDocPermission = useMemo(() => {
    if (!id) return null;
    return documents.find((doc) => doc.id === id)?.permission ?? null;
  }, [documents, id]);

  const canEditTitle = useMemo(() => {
    if (!document) return false;
    if (document.owner_id === user?.id) return true;
    return activeDocPermission === 'edit' || activeDocPermission === 'manage';
  }, [activeDocPermission, document, user?.id]);

  const canManageDoc = useMemo(() => {
    if (!document) return false;
    if (document.owner_id === user?.id) return true;
    return activeDocPermission === 'manage';
  }, [activeDocPermission, document, user?.id]);

  const handleCreateDocument = async () => {
    if (!newTitle.trim()) return;
    if (!selectedWorkspaceId) {
      setCreateDocError(t('workspace.none'));
      return;
    }
    setCreatingDocument(true);
    setCreateDocError('');
    try {
      const doc = await documentService.create(newTitle.trim(), '', selectedWorkspaceId);
      setNewTitle('');
      reload();
      showToast(t('doc.createdSuccess'), 'success');
      navigate(`/documents/${doc.id}`);
    } catch (e: unknown) {
      setCreateDocError(e instanceof Error ? e.message : 'Error');
      showToast(t('doc.createFailed'), 'error');
    } finally {
      setCreatingDocument(false);
    }
  };

  const handleDeleteDocument = async (doc: DocumentListItem) => {
    if (!confirm(t('doc.deleteConfirm'))) return;
    await documentService.delete(doc.id)
      .then(() => {
        showToast(t('doc.deletedSuccess'), 'success');
      })
      .catch(() => {
        showToast(t('doc.deleteFailed'), 'error');
      });
    reload();
    if (id === doc.id) navigate('/');
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    setWorkspaceError('');
    try {
      const ws = await workspaceService.create(newWorkspaceName.trim());
      setWorkspaces((prev) => [ws, ...prev]);
      setSelectedWorkspaceId(ws.id);
      setNewWorkspaceName('');
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleWorkspaceDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWorkspaces((prev) => {
      const oldIndex = prev.findIndex((ws) => ws.id === active.id);
      const newIndex = prev.findIndex((ws) => ws.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      workspaceService.reorder(reordered.map((ws) => ws.id)).catch(() => null);
      return reordered;
    });
  }, []);

  const handleDocumentDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const visibleIds = (filteredDocuments ?? []).map((d) => d.id);
    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedIds = arrayMove(visibleIds, oldIndex, newIndex);
    // Optimistic update: reorder documents state to match the new order
    setDocuments((prev) => {
      const idOrder = new Map(reorderedIds.map((id, i) => [id, i]));
      const visible = new Set(reorderedIds);
      const rest = prev.filter((d) => !visible.has(d.id));
      const reordered = reorderedIds.map((id) => prev.find((d) => d.id === id)!);
      // Place reordered visible docs at their original positions among all docs
      const result = [...prev];
      const positions = prev
        .map((d, i) => (visible.has(d.id) ? i : -1))
        .filter((i) => i !== -1);
      reordered.forEach((doc, i) => {
        result[positions[i]] = { ...doc, sort_order: i };
      });
      void rest; void idOrder;
      return result;
    });
    documentService.reorder(reorderedIds).catch(() => null);
  }, [filteredDocuments, setDocuments]);


  const saveTitle = async () => {
    if (!document || titleSaving) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError(t('doc.titleEmpty'));
      return;
    }
    if (nextTitle === document.title) {
      setIsEditingTitle(false);
      setTitleError('');
      return;
    }
    setTitleSaving(true);
    setTitleError('');
    try {
      const updated = await documentService.updateTitle(document.id, nextTitle);
      setDocument(updated);
      setTitleDraft(updated.title);
      setIsEditingTitle(false);
      reload();
    } catch (e: unknown) {
      setTitleError(e instanceof Error ? e.message : t('doc.updateTitleFailed'));
    } finally {
      setTitleSaving(false);
    }
  };

  const cancelTitleEdit = () => {
    if (!document) return;
    setTitleDraft(document.title);
    setIsEditingTitle(false);
    setTitleError('');
  };

  const handleToggleDocPublic = async () => {
    if (!document || publicToggling) return;
    setPublicToggling(true);
    try {
      const updated = await documentService.setPublic(document.id, !document.is_public);
      setDocument(updated);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : t('doc.togglePublicFailed'));
    } finally {
      setPublicToggling(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!document) return;
    const link = `${window.location.origin}/documents/${document.id}/view`;
    navigator.clipboard.writeText(link).then(() => {
      showToast(t('doc.linkCopied'), 'success');
    }).catch(() => {
      showToast(t('doc.linkCopyFailed'), 'error');
    });
  };

  const handleViewRaw = () => {
    if (!document) return;
    window.open(`/api/documents/${document.id}/raw`, '_blank');
  };

  const toggleColumn = (column: Column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const startResize = useCallback((type: ResizableColumn) => {
    return (event: React.MouseEvent) => {
      event.preventDefault();
      resizeRef.current = {
        type,
        startX: event.clientX,
        startWidths: { ...columnWidths },
      };
      window.document.body.classList.add('is-resizing');
    };
  }, [columnWidths]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const containerWidth = containerRef.current?.offsetWidth ?? 0;
      if (!containerWidth) return;

      const { type, startX, startWidths } = resizeRef.current;
      const delta = event.clientX - startX;

      const hasWorkspace = visibleColumns.workspace;
      const hasDocuments = visibleColumns.documents;
      const hasPreview = visibleColumns.preview;
      const hasLeftColumn = hasWorkspace || hasDocuments;
      const hasWorkspaceDocsHandle = hasWorkspace && hasDocuments;
      const resizerCount = (hasWorkspaceDocsHandle ? 1 : 0)
        + (hasLeftColumn ? 1 : 0)
        + (hasPreview ? 1 : 0);
      const resizerTotal = resizerCount * RESIZER_WIDTH;

      const workspaceWidth = hasWorkspace ? startWidths.workspace : 0;
      const documentsWidth = hasDocuments ? startWidths.documents : 0;
      const previewWidth = hasPreview ? startWidths.preview : 0;

      const clamp = (value: number, min: number, max: number) => {
        if (Number.isFinite(max)) return Math.max(min, Math.min(value, max));
        return Math.max(min, value);
      };

      if (type === 'workspace' && hasWorkspace) {
        const maxWidth = containerWidth - resizerTotal - documentsWidth - previewWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.workspace + delta,
          MIN_WIDTHS.workspace,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, workspace: nextWidth }));
        return;
      }

      if (type === 'documents' && hasDocuments) {
        const maxWidth = containerWidth - resizerTotal - workspaceWidth - previewWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.documents + delta,
          MIN_WIDTHS.documents,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, documents: nextWidth }));
        return;
      }

      if (type === 'preview' && hasPreview) {
        const maxWidth = containerWidth - resizerTotal - workspaceWidth - documentsWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.preview - delta,
          MIN_WIDTHS.preview,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, preview: nextWidth }));
      }
    };

    const handleUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        window.document.body.classList.remove('is-resizing');
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [visibleColumns]);

  const columnsStyle = useMemo(() => {
    const columns: string[] = [];
    const isSettingsMode = mode === 'settings';
    const hasWorkspace = visibleColumns.workspace;
    const hasDocuments = visibleColumns.documents && !isSettingsMode;
    const hasPreview = visibleColumns.preview && !isSettingsMode;
    const hasEditor = !isSettingsMode;
    const hasLeftColumn = hasWorkspace || hasDocuments;
    const hasWorkspaceDocsHandle = hasWorkspace && hasDocuments;

    if (hasWorkspace) columns.push(`${columnWidths.workspace}px`);
    if (hasWorkspaceDocsHandle) columns.push(`${RESIZER_WIDTH}px`);
    if (hasDocuments) columns.push(`${columnWidths.documents}px`);
    if (hasLeftColumn && hasEditor) columns.push(`${RESIZER_WIDTH}px`);
    if (hasEditor) columns.push(`minmax(${MIN_EDITOR_WIDTH}px, 1fr)`);
    if (hasPreview) columns.push(`${RESIZER_WIDTH}px`, `${columnWidths.preview}px`);
    if (isSettingsMode) columns.push(`minmax(${MIN_EDITOR_WIDTH}px, 1fr)`);
    return {
      gridTemplateColumns: columns.join(' '),
    } as React.CSSProperties;
  }, [visibleColumns, columnWidths, mode]);

  return (
    <div className="notes-shell">
      <header className="notes-topbar">
        <div className="topbar-left">
          <span className="app-title">{siteTitle}</span>
          <div className="doc-title-wrap">
            {!document && <span className="doc-title">{t('doc.noneSelected')}</span>}
            {document && !isEditingTitle && (
              <span className="doc-title" title={document.title}>{document.title}</span>
            )}
            {document && isEditingTitle && (
              <div className="doc-title-edit">
                <input
                  className="doc-title-input"
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') cancelTitleEdit();
                  }}
                  onBlur={saveTitle}
                  disabled={titleSaving}
                  aria-label={t('doc.titleLabel')}
                />
                <div className="doc-title-actions">
                  <button
                    className="doc-title-btn"
                    onClick={saveTitle}
                    disabled={titleSaving}
                  >
                    {t('doc.save')}
                  </button>
                  <button
                    className="doc-title-btn ghost"
                    onClick={cancelTitleEdit}
                    disabled={titleSaving}
                  >
                    {t('doc.cancel')}
                  </button>
                </div>
              </div>
            )}
            {document && canEditTitle && !isEditingTitle && (
              <button
                className="doc-title-btn ghost"
                onClick={() => setIsEditingTitle(true)}
                title={t('doc.editTitle')}
              >
                {t('doc.editTitle')}
              </button>
            )}
          </div>
        </div>

        <div className="topbar-center">
          <div className="menu-group">
            <button
              className={visibleColumns.workspace ? 'active' : ''}
              onClick={() => toggleColumn('workspace')}
            >
              {t('nav.workspace')}
            </button>
            <button
              className={visibleColumns.documents ? 'active' : ''}
              onClick={() => toggleColumn('documents')}
              disabled={mode === 'settings'}
            >
              {t('nav.documents')}
            </button>
            <button
              className={visibleColumns.preview ? 'active' : ''}
              onClick={() => toggleColumn('preview')}
              disabled={mode === 'settings'}
            >
              {t('nav.previewPanel')}
            </button>
          </div>
          <div className="menu-group">
            <button
              className={activePanel === 'preview' ? 'active' : ''}
              onClick={() => setActivePanel('preview')}
              disabled={mode === 'settings'}
            >
              {t('nav.preview')}
            </button>
            <button
              className={activePanel === 'history' ? 'active' : ''}
              onClick={() => setActivePanel('history')}
              disabled={mode === 'settings'}
            >
              {t('nav.history')}
            </button>
            <button
              className={activePanel === 'permissions' ? 'active' : ''}
              onClick={() => setActivePanel('permissions')}
              disabled={mode === 'settings'}
            >
              {t('nav.permissions')}
            </button>
            <button
              className={activePanel === 'attachments' ? 'active' : ''}
              onClick={() => setActivePanel('attachments')}
              disabled={mode === 'settings'}
            >
              {t('nav.attachments')}
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="icon-btn"
            onClick={() => setSearchOpen(true)}
            title={t('search.title', '搜索文档')}
            aria-label={t('search.title', '搜索文档')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          {document && mode === 'edit' && (
            <div className="menu-group doc-visibility-group">
              {canManageDoc && (
                <button
                  className={`icon-btn ${document.is_public ? 'active' : ''}`}
                  onClick={handleToggleDocPublic}
                  disabled={publicToggling}
                  title={document.is_public ? t('doc.setPrivate') : t('doc.setPublic')}
                  aria-label={document.is_public ? t('doc.setPrivate') : t('doc.setPublic')}
                >
                  {document.is_public ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </button>
              )}
              {document.is_public && (
                <button
                  className="icon-btn"
                  onClick={handleCopyPublicLink}
                  title={t('doc.publicLink')}
                  aria-label={t('doc.publicLink')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </button>
              )}
              <button
                className="icon-btn"
                onClick={handleViewRaw}
                title={t('doc.viewRaw')}
                aria-label={t('doc.viewRaw')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </button>
            </div>
          )}
          {id && (
            <span className={`ws-pill ws-${connectionState}`}>
              {connectionState === 'connected' ? t('common.connected') : connectionState === 'connecting' ? t('common.connecting') : t('common.disconnected')}
            </span>
          )}
          {collaborators.length > 0 && (
            <span className="collaborators">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="7" r="4"/>
                <path d="M5.5 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {collaborators.length} {t('common.online')}
            </span>
          )}
          <button className="ghost" onClick={() => navigate('/home')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            {t('nav.home')}
          </button>
          <div className="user-menu">
            <button className="user-chip" onClick={() => navigate('/me')}>
              <span className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</span>
              <span>{user?.username}</span>
              {user?.is_admin && <span style={{ color: 'var(--accent)', marginLeft: '2px' }}>★</span>}
            </button>
          </div>
          <button className="ghost" onClick={logout}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="notes-columns" style={columnsStyle} ref={containerRef}>
        {visibleColumns.workspace && (
          <aside className="notes-column workspace-column">
            <div className="column-header">
              <div>
                <h3>{t('workspace.title')}</h3>
              </div>
              <span></span>
            </div>
            <div className="workspace-list">
              <button
                className={`workspace-item ${showAllWorkspaces ? 'active' : ''}`}
                onClick={() => setShowAllWorkspaces(true)}
              >
                {t('workspace.all')}
              </button>
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleWorkspaceDragEnd}>
                <SortableContext items={workspaces.map((ws) => ws.id)} strategy={verticalListSortingStrategy}>
                  {workspaces.map((ws) => (
                    <SortableWorkspaceItem
                      key={ws.id}
                      ws={ws}
                      isActive={!showAllWorkspaces && selectedWorkspaceId === ws.id}
                      onSelect={() => {
                        setMode('edit');
                        setShowAllWorkspaces(false);
                        setSelectedWorkspaceId(ws.id);
                      }}
                      onSettings={() => {
                        setShowAllWorkspaces(false);
                        setSelectedWorkspaceId(ws.id);
                        setMode('settings');
                      }}
                      settingsLabel={t('workspace.settings')}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {workspaces.length === 0 && !workspaceLoading && (
                <div className="empty">{t('workspace.none')}</div>
              )}
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder={t('workspace.createPlaceholder')}
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
              />
              <button onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
                {creatingWorkspace ? t('workspace.creating') : t('workspace.create')}
              </button>
            </div>
          </aside>
        )}

        {mode === 'edit' && visibleColumns.workspace && visibleColumns.documents && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整工作空间宽度"
            onMouseDown={startResize('workspace')}
          />
        )}

        {mode === 'edit' && visibleColumns.documents && (
          <aside className="notes-column document-column">
            <div className="column-header">
              <div>
                <h3>{t('nav.documents')}</h3>
              </div>
              <button className="secondary" onClick={reload} disabled={docsLoading}>
                {t('common.refresh')}
              </button>
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder={t('doc.newTitlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocument()}
              />
              <button onClick={handleCreateDocument} disabled={creatingDocument || !newTitle.trim() || !selectedWorkspaceId}>
                {creatingDocument ? t('doc.creating') : t('doc.create')}
              </button>
            </div>
            <div className="document-list" style={{ flex: '1 1 auto', minHeight: 0 }}>
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDocumentDragEnd}>
                <SortableContext items={(filteredDocuments ?? []).map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  {(filteredDocuments ?? []).map((doc) => (
                    <SortableDocumentItem
                      key={doc.id}
                      doc={doc}
                      isActive={id === doc.id}
                      isOwner={doc.owner_id === user?.id}
                      workspaceName={doc.workspace_id ? workspaceMap.get(doc.workspace_id)?.name ?? t('nav.workspace') : t('nav.workspace')}
                      locale={i18n.language}
                      onNavigate={() => navigate(`/documents/${doc.id}`)}
                      onDelete={() => handleDeleteDocument(doc)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {filteredDocuments?.length === 0 && <div className="empty">{t('doc.empty')}</div>}
            </div>
          </aside>
        )}

        {mode === 'edit' && (visibleColumns.documents || visibleColumns.workspace) && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整左侧列表宽度"
            onMouseDown={startResize(visibleColumns.documents ? 'documents' : 'workspace')}
          />
        )}
        {mode === 'edit' && (
          <main className="notes-column editor-column">
            {docLoading && <div className="loading-inline">{t('common.loading')}</div>}
            {!docLoading && !document && (
              <div className="empty-state">
                {t('doc.pickPrompt')}
              </div>
            )}
            {!docLoading && document && (
              <textarea
                ref={textareaRef}
                className="editor-textarea"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                spellCheck={false}
              />
            )}
          </main>
        )}

        {mode === 'edit' && visibleColumns.preview && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整预览宽度"
            onMouseDown={startResize('preview')}
          />
        )}

        {mode === 'edit' && visibleColumns.preview && (
          <aside className="notes-column preview-column">
            {activePanel === 'preview' && (
              document
                ? <MarkdownPreview content={content} />
                : <div className="empty-state">{t('doc.previewEmpty')}</div>
            )}
            {activePanel === 'history' && (
              document
                ? <SnapshotPanel documentId={document.id} onRestore={(doc) => {
                  setDocument(doc);
                  setContent(doc.content);
                }} />
                : <div className="empty-state">{t('doc.historyEmpty')}</div>
            )}
            {activePanel === 'permissions' && (
              document
                ? <PermissionsPanel documentId={document.id} />
                : <div className="empty-state">{t('doc.permissionsEmpty')}</div>
            )}
            {activePanel === 'attachments' && (
              document
                ? <AttachmentPanel
                    documentId={document.id}
                    workspaceId={document.workspace_id || ''}
                    onInsert={handleInsertAttachment}
                  />
                : <div className="empty-state">{t('doc.attachmentsEmpty')}</div>
            )}
          </aside>
        )}

        {mode === 'settings' && (
          <section className="notes-column settings-column">
            <div className="column-header">
              <div>
                <h3>{t('workspace.settings')}</h3>
              </div>
              <button className="secondary" onClick={() => setMode('edit')}>
                {t('nav.editor')}
              </button>
            </div>
            <div className="settings-body">
              <WorkspaceSettingsPanel
                workspaceId={selectedWorkspaceId}
                workspaceOwnerId={selectedWorkspace?.owner_id}
                workspaceName={selectedWorkspace?.name}
                workspaceIsPublic={selectedWorkspace?.is_public}
                currentUserId={user?.id}
                onWorkspaceUpdated={handleWorkspaceUpdated}
                onWorkspaceDeleted={handleWorkspaceDeleted}
              />
            </div>
          </section>
        )}
      </div>

      <ErrorModal message={modalError} onClose={handleCloseError} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
