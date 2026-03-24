import { useState, useMemo } from 'react';
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
import { buildDocumentTree, countDescendants } from '@/utils/documentTree';

interface TreeDocumentItemProps {
  node: DocumentTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  isActive: boolean;
  isOwner: boolean;
  locale: string;
  onNavigate: () => void;
  onDelete: () => void;
  onCreateChild: (parentId: string) => void;
}

function SortableTreeItem({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  isActive,
  isOwner,
  locale: _locale,
  onNavigate,
  onDelete,
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

      {hasChildren || true ? (
        <button
          className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
          onClick={() => onToggleExpand(doc.id)}
          aria-label={isExpanded ? '折叠' : '展开'}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      ) : (
        <span className="expand-placeholder" />
      )}

      <button className="doc-main" onClick={onNavigate}>
        <span className="doc-title">{doc.title}</span>
        {hasChildren && (
          <span className="doc-child-count">({countDescendants(node)})</span>
        )}
      </button>

      {isOwner && (
        <div className="doc-actions">
          <button
            className="doc-add-child"
            onClick={() => onCreateChild(doc.id)}
            title="添加子文档"
            aria-label="添加子文档"
          >
            +
          </button>
          <button className="doc-delete" onClick={onDelete} aria-label="删除文档">
            🗑️
          </button>
        </div>
      )}
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
  onCreateChild,
  onMove,
  onReorder,
}: TreeDocumentListProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [creatingChildFor, setCreatingChildFor] = useState<string | null>(null);
  const [newChildTitle, setNewChildTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build tree structure
  const tree = useMemo(() => buildDocumentTree(documents), [documents]);

  // Flatten tree for flat view
  const flatNodes = useMemo(() => {
    const result: DocumentTreeNode[] = [];
    const flatten = (nodes: DocumentTreeNode[], depth: number) => {
      for (const node of nodes) {
        result.push(node);
        if (expandedIds.has(node.document.id)) {
          flatten(node.children, depth + 1);
        }
      }
    };
    flatten(tree, 0);
    return result;
  }, [tree, expandedIds]);

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

  const handleCreateChild = (parentId: string) => {
    setCreatingChildFor(parentId);
    setNewChildTitle('');
  };

  const handleConfirmCreateChild = () => {
    if (creatingChildFor && newChildTitle.trim()) {
      onCreateChild(creatingChildFor, newChildTitle.trim());
      setCreatingChildFor(null);
      setNewChildTitle('');
      // Auto-expand parent
      setExpandedIds((prev) => new Set([...prev, creatingChildFor]));
    }
  };

  const handleCancelCreateChild = () => {
    setCreatingChildFor(null);
    setNewChildTitle('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // For now, just handle reorder within same level
    // Moving between parents would require more complex logic
    const activeDoc = documents.find((d) => d.id === active.id);
    const overDoc = documents.find((d) => d.id === over.id);

    if (activeDoc && overDoc) {
      if (activeDoc.parent_id === overDoc.parent_id) {
        // Same parent - simple reorder
        onReorder(activeDoc.id, overDoc.sort_order);
      } else {
        // Different parents - move
        onMove(activeDoc.id, overDoc.parent_id ?? null, overDoc.sort_order);
      }
    }
  };

  const renderTreeNode = (node: DocumentTreeNode, depth: number): React.ReactNode => {
    const doc = node.document;
    const children = node.children;
    const isActive = doc.id === selectedId;
    const isOwner = doc.owner_id === currentUserId;
    const isExpanded = expandedIds.has(doc.id);

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
          onDelete={() => onDelete(doc)}
          onCreateChild={handleCreateChild}
        />
        {creatingChildFor === doc.id && (
          <div className="tree-create-child" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            <input
              type="text"
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreateChild();
                if (e.key === 'Escape') handleCancelCreateChild();
              }}
              placeholder={t('doc.newTitlePlaceholder')}
              autoFocus
            />
            <button onClick={handleConfirmCreateChild} disabled={!newChildTitle.trim()}>
              {t('common.confirm')}
            </button>
            <button onClick={handleCancelCreateChild}>{t('common.cancel')}</button>
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
      <div className="tree-toolbar">
        <button
          className={`view-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
          onClick={() => setViewMode('tree')}
          title="树形视图"
        >
          🌲
        </button>
        <button
          className={`view-mode-btn ${viewMode === 'flat' ? 'active' : ''}`}
          onClick={() => setViewMode('flat')}
          title="扁平视图"
        >
          📋
        </button>
      </div>

      <div className="tree-content">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={viewMode === 'tree' ? allItemIds : allItemIds}
            strategy={verticalListSortingStrategy}
          >
            {viewMode === 'tree' ? (
              tree.length === 0 ? (
                <div className="empty">{t('doc.empty')}</div>
              ) : (
                tree.map((node) => renderTreeNode(node, 0))
              )
            ) : (
              // Flat view
              <>
                {creatingChildFor !== null && (
                  <div className="tree-create-child" style={{ padding: '8px' }}>
                    <input
                      type="text"
                      value={newChildTitle}
                      onChange={(e) => setNewChildTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmCreateChild();
                        if (e.key === 'Escape') handleCancelCreateChild();
                      }}
                      placeholder={t('doc.newTitlePlaceholder')}
                      autoFocus
                    />
                    <button onClick={handleConfirmCreateChild} disabled={!newChildTitle.trim()}>
                      {t('common.confirm')}
                    </button>
                    <button onClick={handleCancelCreateChild}>{t('common.cancel')}</button>
                  </div>
                )}
                {flatNodes.length === 0 ? (
                  <div className="empty">{t('doc.empty')}</div>
                ) : (
                  flatNodes.map((node) => (
                    <SortableTreeItem
                      key={node.document.id}
                      node={node}
                      depth={0}
                      expandedIds={expandedIds}
                      onToggleExpand={handleToggleExpand}
                      isActive={node.document.id === selectedId}
                      isOwner={node.document.owner_id === currentUserId}
                      locale={locale}
                      onNavigate={() => onSelect(node.document)}
                      onDelete={() => onDelete(node.document)}
                      onCreateChild={handleCreateChild}
                    />
                  ))
                )}
              </>
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
