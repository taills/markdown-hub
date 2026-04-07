import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem, DocumentTreeNode } from '@/types';
import { buildDocumentTree } from '@/utils/documentTree';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: DocumentTreeNode | null;
}

interface TreeItemProps {
  node: DocumentTreeNode;
  level: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedId?: string;
  onSelect: (doc: DocumentListItem) => void;
  onContextMenu: (e: React.MouseEvent, node: DocumentTreeNode) => void;
  onCreateChild: (parentId: string) => void;
}

function TreeItem({
  node,
  level,
  expandedIds,
  onToggleExpand,
  selectedId,
  onSelect,
  onContextMenu,
  onCreateChild,
}: TreeItemProps) {
  const doc = node.document;
  const children = node.children;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(doc.id);
  const isSelected = doc.id === selectedId;

  return (
    <div className="tree-node" data-doc-id={doc.id}>
      {/* Node Row */}
      <div
        className={`tree-row ${isSelected ? 'selected' : ''}`}
        style={{ '--tree-level': level } as React.CSSProperties}
        onClick={() => onSelect(doc)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node);
        }}
      >
        {/* Expand Toggle */}
        <button
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(doc.id);
          }}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {hasChildren && (
            <svg
              className={`toggle-icon ${isExpanded ? 'expanded' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>

        {/* Document Icon */}
        <svg
          className={`tree-icon ${hasChildren ? 'folder' : 'file'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {hasChildren ? (
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          ) : (
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          )}
        </svg>

        {/* Title */}
        <span className="tree-title">{doc.title}</span>

        {/* Add Child Button */}
        <button
          className="tree-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCreateChild(doc.id);
          }}
          title="添加子文档"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Children */}
      {hasChildren && (
        <div className={`tree-children ${isExpanded ? 'expanded' : ''}`}>
          {children.map((child) => (
            <TreeItem
              key={child.document.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedId={selectedId}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onCreateChild={onCreateChild}
            />
          ))}
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
  onRename: (doc: DocumentListItem, newTitle: string) => void;
  onCreateChild: (parentId: string, title: string) => void;
  onMove: (docId: string, newParentId: string | null, newSortOrder: number) => void;
  onReorder: (docId: string, newSortOrder: number) => void;
}

export function TreeDocumentList({
  documents,
  selectedId,
  currentUserId: _currentUserId,
  locale: _locale,
  onSelect,
  onDelete,
  onRename,
  onCreateChild,
  onMove: _onMove,
  onReorder: _onReorder,
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
  const contextMenuNodeRef = useRef<DocumentTreeNode | null>(null);

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

  // Native context menu handler
  useEffect(() => {
    const handleNativeContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const treeNode = target.closest('.tree-node');
      if (treeNode) {
        e.preventDefault();
        const docId = treeNode.getAttribute('data-doc-id');
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

  return (
    <div className="tree-container">
      <div className="tree-content">
        {/* Tree Root */}
        <div className="tree-root" role="tree" aria-orientation="vertical">
          {tree.length === 0 ? (
            <div className="tree-empty">
              <svg className="tree-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p className="tree-empty-text">{t('doc.empty', '暂无文档')}</p>
            </div>
          ) : (
            tree.map((node) => (
              <TreeItem
                key={node.document.id}
                node={node}
                level={0}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                selectedId={selectedId}
                onSelect={onSelect}
                onContextMenu={handleContextMenu}
                onCreateChild={handleCreateChild}
              />
            ))
          )}
        </div>

        {/* Inline Create Child Input */}
        {creatingChildFor && (
          <div className="tree-inline-input">
            <input
              type="text"
              className="input"
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreateChild();
                if (e.key === 'Escape') handleCancelCreateChild();
              }}
              onBlur={handleConfirmCreateChild}
              placeholder={t('doc.newTitlePlaceholder')}
              autoFocus
            />
          </div>
        )}

        {/* Inline Rename Input */}
        {editingNode && (
          <div className="tree-inline-input">
            <input
              type="text"
              className="input"
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
      </div>

      {/* Context Menu - BMW Style */}
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
          <button className="context-menu-item" onClick={handleStartRename}>
            <svg className="context-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            {t('doc.rename', '重命名')}
          </button>
          <button className="context-menu-item" onClick={handleInsertChild}>
            <svg className="context-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('doc.insertChild', '插入子级')}
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger" onClick={handleDelete}>
            <svg className="context-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {t('doc.delete', '删除')}
          </button>
        </div>
      )}
    </div>
  );
}
