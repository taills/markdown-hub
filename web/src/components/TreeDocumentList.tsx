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

  const paddingLeft = level * 16 + 8;

  return (
    <div
      className={`hs-accordion hs-accordion-treeview-level-${level + 1} ${isSelected ? 'active' : ''}`}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      data-doc-id={doc.id}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node);
      }}
    >
      {/* Accordion Heading */}
      <div
        className="hs-accordion-heading py-0.5 flex items-center gap-x-0.5 w-full"
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {/* Toggle Button */}
        {hasChildren ? (
          <button
            className="hs-accordion-toggle size-6 flex justify-center items-center hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-md focus:outline-hidden disabled:opacity-50 disabled:pointer-events-none"
            onClick={() => onToggleExpand(doc.id)}
            aria-expanded={isExpanded}
          >
            <svg
              className={`size-4 text-gray-600 dark:text-neutral-400 ${isExpanded ? 'hs-accordion-active:rotate-90' : ''} transition-transform duration-200`}
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ) : (
          <span className="size-6" />
        )}

        {/* Document Link */}
        <div
          className={`grow px-1.5 rounded-md cursor-pointer ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : 'hover:bg-gray-50 dark:hover:bg-neutral-800'
          }`}
          onClick={() => onSelect(doc)}
        >
          <div className="flex items-center gap-x-3">
            {/* Document Icon */}
            <svg
              className={`shrink-0 size-4 ${
                hasChildren
                  ? 'text-yellow-500'
                  : 'text-gray-400 dark:text-neutral-500'
              }`}
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {hasChildren ? (
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              ) : (
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              )}
            </svg>

            {/* Title */}
            <span className="grow text-sm text-gray-800 dark:text-neutral-200 truncate">
              {doc.title}
            </span>

            {/* Add Child Button */}
            <button
              className="shrink-0 size-5 flex justify-center items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onCreateChild(doc.id);
              }}
              title="添加子文档"
            >
              <svg
                className="size-3.5"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Content */}
      {hasChildren && (
        <div
          id={`collapse-${doc.id}`}
          className={`hs-accordion-content w-full overflow-hidden transition-[height] duration-300 ${
            isExpanded ? 'active' : ''
          }`}
          role="group"
        >
          <div className="pb-1">
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
      const treeItem = target.closest('.hs-accordion');
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
    <div className="py-2">
      <div className="tree-content">
        {/* Tree Root */}
        <div
          className="hs-accordion-treeview-root"
          role="tree"
          aria-orientation="vertical"
        >
          {tree.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
              {t('doc.empty', '暂无文档')}
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
          <div className="px-4 py-2">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <div className="px-4 py-2">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.node && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            onClick={handleStartRename}
          >
            <svg
              className="size-4"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            {t('doc.rename', '重命名')}
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            onClick={handleInsertChild}
          >
            <svg
              className="size-4"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            {t('doc.insertChild', '插入子级')}
          </button>
          <div className="h-px bg-gray-200 dark:bg-neutral-700 my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            onClick={handleDelete}
          >
            <svg
              className="size-4"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {t('doc.delete', '删除')}
          </button>
        </div>
      )}
    </div>
  );
}
