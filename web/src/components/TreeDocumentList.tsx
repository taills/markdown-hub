import { useState, useMemo, useRef, useEffect } from 'react';
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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DocumentListItem, DocumentTreeNode } from '@/types';
import { buildDocumentTree } from '@/utils/documentTree';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: DocumentTreeNode | null;
}

interface TreeDocumentItemProps {
  node: DocumentTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  isActive: boolean;
  isOwner: boolean;
  locale: string;
  onNavigate: () => void;
  onContextMenu: (e: React.MouseEvent, node: DocumentTreeNode) => void;
  onCreateChild: (parentId: string) => void;
}

function SortableTreeItem({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  isActive,
  isOwner: _isOwner,
  locale: _locale,
  onNavigate,
  onContextMenu,
  onCreateChild,
}: TreeDocumentItemProps) {
  const doc = node.document;
  const children = node.children;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(doc.id);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: doc.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${depth * 16 + 8}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tree-document-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      data-doc-id={doc.id}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node);
      }}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="拖拽"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="2" cy="2" r="1" />
          <circle cx="5" cy="2" r="1" />
          <circle cx="8" cy="2" r="1" />
          <circle cx="2" cy="5" r="1" />
          <circle cx="5" cy="5" r="1" />
          <circle cx="8" cy="5" r="1" />
          <circle cx="2" cy="8" r="1" />
          <circle cx="5" cy="8" r="1" />
          <circle cx="8" cy="8" r="1" />
        </svg>
      </button>

      {hasChildren ? (
        <button
          className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
          onClick={() => onToggleExpand(doc.id)}
          aria-label={isExpanded ? '折叠' : '展开'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            {isExpanded ? (
              <path d="M3 4.5L6 7.5L9 4.5" />
            ) : (
              <path d="M4.5 3L7.5 6L4.5 9" />
            )}
          </svg>
        </button>
      ) : (
        <span className="expand-placeholder" />
      )}

      <button className="doc-main" onClick={onNavigate}>
        <span className="doc-title">{doc.title}</span>
      </button>
      <button
        className="add-child-btn"
        onClick={(e) => {
          e.stopPropagation();
          onCreateChild(doc.id);
        }}
        title="添加子文档"
      >
        +
      </button>
    </div>
  );
}

interface TreeDocumentListProps {
  documents: DocumentListItem[];
  selectedId?: string;
  currentUserId?: string;
  locale: string;
  onSelect: (doc: DocumentListItem) => void;
  onDelete: (doc: DocumentListItem) => void;
  onRename: (doc: DocumentListItem, newTitle: string) => void;
  onCreateChild: (parentId: string, title: string) => void;
  onMove: (docId: string, newParentId: string | null, newSortOrder: number) => void;
  onReorder: (docId: string, newSortOrder: number) => void;
}

export function TreeDocumentList({
  documents,
  selectedId,
  currentUserId,
  locale,
  onSelect,
  onDelete,
  onRename,
  onCreateChild,
  onMove,
  onReorder,
}: TreeDocumentListProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [creatingChildFor, setCreatingChildFor] = useState<string | null>(null);
  const [newChildTitle, setNewChildTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the context menu node for event handlers
  const contextMenuNodeRef = useRef<DocumentTreeNode | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build tree structure
  const tree = useMemo(() => buildDocumentTree(documents), [documents]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, node: null });
      }
    };
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.visible]);

  // Close context menu on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    const scrollContainer = document.querySelector('.tree-content');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [contextMenu.visible]);

  // Native context menu handler as fallback for Playwright/testing
  useEffect(() => {
    const handleNativeContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const treeItem = target.closest('.tree-document-item');
      if (treeItem) {
        e.preventDefault();
        const docId = treeItem.getAttribute('data-doc-id');
        if (docId) {
          const node = findNodeById(tree, docId);
          if (node) {
            contextMenuNodeRef.current = node;
            setContextMenu({
              visible: true,
              x: e.clientX,
              y: e.clientY,
              node,
            });
          }
        }
      }
    };

    document.addEventListener('contextmenu', handleNativeContextMenu);
    return () => document.removeEventListener('contextmenu', handleNativeContextMenu);
  }, [tree]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, node: DocumentTreeNode) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  const handleCreateChild = (parentId: string) => {
    setCreatingChildFor(parentId);
    setNewChildTitle('');
  };

  const handleConfirmCreateChild = () => {
    if (creatingChildFor) {
      const title = newChildTitle.trim() || t('doc.untitled', '未命名文档');
      onCreateChild(creatingChildFor, title);
      setCreatingChildFor(null);
      setNewChildTitle('');
      setExpandedIds((prev) => new Set([...prev, creatingChildFor]));
    }
  };

  const handleCancelCreateChild = () => {
    setCreatingChildFor(null);
    setNewChildTitle('');
  };

  const handleStartRename = () => {
    const node = contextMenuNodeRef.current || contextMenu.node;
    if (node) {
      setEditingNode(node.document.id);
      setEditingTitle(node.document.title);
      setContextMenu({ visible: false, x: 0, y: 0, node: null });
    }
  };

  const handleConfirmRename = () => {
    if (editingNode) {
      const node = findNodeById(tree, editingNode);
      if (node) {
        const newTitle = editingTitle.trim() || node.document.title;
        if (newTitle !== node.document.title) {
          onRename(node.document, newTitle);
        }
      }
      setEditingNode(null);
      setEditingTitle('');
    }
  };

  const handleCancelRename = () => {
    setEditingNode(null);
    setEditingTitle('');
  };

  const findNodeById = (nodes: DocumentTreeNode[], id: string): DocumentTreeNode | null => {
    for (const node of nodes) {
      if (node.document.id === id) return node;
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeDoc = documents.find((d) => d.id === active.id);
    const overDoc = documents.find((d) => d.id === over.id);

    if (activeDoc && overDoc) {
      if (activeDoc.parent_id === overDoc.parent_id) {
        onReorder(activeDoc.id, overDoc.sort_order);
      } else {
        onMove(activeDoc.id, overDoc.parent_id ?? null, overDoc.sort_order);
      }
    }
  };

  const handleDelete = () => {
    const node = contextMenuNodeRef.current || contextMenu.node;
    if (node) {
      onDelete(node.document);
      setContextMenu({ visible: false, x: 0, y: 0, node: null });
    }
  };

  const handleInsertChild = () => {
    const node = contextMenuNodeRef.current || contextMenu.node;
    if (node) {
      handleCreateChild(node.document.id);
      setContextMenu({ visible: false, x: 0, y: 0, node: null });
    }
  };

  const renderTreeNode = (node: DocumentTreeNode, depth: number): React.ReactNode => {
    const doc = node.document;
    const children = node.children;
    const isActive = doc.id === selectedId;
    const isOwner = doc.owner_id === currentUserId;
    const isExpanded = expandedIds.has(doc.id);
    const isEditing = editingNode === doc.id;

    return (
      <div key={doc.id} className="tree-node">
        <SortableTreeItem
          node={node}
          depth={depth}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          isActive={isActive}
          isOwner={isOwner}
          locale={locale}
          onNavigate={() => onSelect(doc)}
          onContextMenu={handleContextMenu}
          onCreateChild={handleCreateChild}
        />
        {isEditing && (
          <div className="tree-create-child" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            <input
              type="text"
              className="inline-edit-input"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
              onBlur={handleConfirmRename}
              autoFocus
            />
          </div>
        )}
        {creatingChildFor === doc.id && (
          <div className="tree-create-child" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            <input
              type="text"
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmCreateChild();
                }
                if (e.key === 'Escape') handleCancelCreateChild();
              }}
              onBlur={() => {
                // Small delay to allow click events to process first
                setTimeout(handleConfirmCreateChild, 100);
              }}
              placeholder={t('doc.newTitlePlaceholder')}
              className="inline-edit-input"
              autoFocus
            />
          </div>
        )}
        {isExpanded && children.length > 0 && (
          <div className="tree-children">
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const allItemIds = documents.map((d) => d.id);

  return (
    <div className="tree-document-list">
      <div className="tree-content">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allItemIds}
            strategy={verticalListSortingStrategy}
          >
            {tree.length === 0 ? (
              <div className="empty">{t('doc.empty')}</div>
            ) : (
              tree.map((node) => renderTreeNode(node, 0))
            )}
          </SortableContext>
        </DndContext>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.node && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button
            className="context-menu-item"
            onClick={handleStartRename}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {t('doc.rename', '重命名')}
          </button>
          <button
            className="context-menu-item"
            onClick={handleInsertChild}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('doc.insertChild', '插入子级')}
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            className="context-menu-item danger"
            onClick={handleDelete}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {t('doc.delete', '删除')}
          </button>
        </div>
      )}
    </div>
  );
}
