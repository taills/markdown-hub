import type { DocumentListItem, DocumentTreeNode } from '@/types';

/**
 * Builds a tree structure from a flat list of documents
 */
export function buildDocumentTree(documents: DocumentListItem[]): DocumentTreeNode[] {
  const map = new Map<string, DocumentTreeNode>();
  const roots: DocumentTreeNode[] = [];

  // First pass: create all nodes
  for (const doc of documents) {
    map.set(doc.id, {
      document: doc as DocumentListItem,
      children: [],
    });
  }

  // Second pass: build tree structure
  for (const doc of documents) {
    const node = map.get(doc.id)!;
    if (doc.parent_id && map.has(doc.parent_id)) {
      // Has a parent - add as child
      map.get(doc.parent_id)!.children.push(node);
    } else {
      // Root document
      roots.push(node);
    }
  }

  // Sort by sort_order
  const sortNodes = (nodes: DocumentTreeNode[]) => {
    nodes.sort((a, b) => a.document.sort_order - b.document.sort_order);
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);

  return roots;
}

/**
 * Flattens a tree back to a list (for flat view)
 */
export function flattenTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  const result: DocumentTreeNode[] = [];
  const flatten = (nodes: DocumentTreeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      flatten(node.children);
    }
  };
  flatten(nodes);
  return result;
}

/**
 * Counts total descendants
 */
export function countDescendants(node: DocumentTreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}
