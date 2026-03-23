export type PermissionLevel = 'read' | 'edit' | 'manage';

export interface User {
  id: string;
  username: string;
  email: string;
  preferred_language: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  accessible_documents: number;
  owned_documents: number;
  workspaces: number;
  attachments_uploaded: number;
  snapshots_authored: number;
}

export interface Document {
  id: string;
  parent_id?: string; // parent document ID, nil means root document (new field after migration)
  workspace_id?: string; // workspace ID (deprecated after migration, kept for compatibility)
  owner_id: string;
  title: string;
  content: string;
  visibility: 'public' | 'internal'; // new field after migration
  inherit_visibility: boolean; // new field after migration
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItem {
  id: string;
  parent_id?: string; // parent document ID, nil means root document
  workspace_id?: string;
  owner_id: string;
  title: string;
  content: string;
  visibility: 'public' | 'internal';
  inherit_visibility: boolean;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  permission?: PermissionLevel; // only present if not owner
}

export interface DocumentTreeNode {
  document: Document;
  children: DocumentTreeNode[];
}

export interface DocumentSearchResult {
  id: string;
  parent_id?: string;
  title: string;
  content: string;
  workspace_id?: string;
  workspace_name?: string; // kept for compatibility
  owner_id: string;
  visibility: 'public' | 'internal';
  is_public: boolean;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

export interface Snapshot {
  id: string;
  document_id: string;
  author_id: string;
  content: string;
  message: string;
  created_at: string;
}

export interface DocumentPermission {
  id: string;
  document_id: string;
  user_id: string;
  level: PermissionLevel;
  created_at: string;
  username?: string;
}

export interface HeadingPermission {
  id: string;
  document_id: string;
  user_id: string;
  heading_anchor: string;
  level: PermissionLevel;
  created_at: string;
}

export interface HeadingSection {
  anchor: string;
  title: string;
  level: number;
  start_byte: number;
  end_byte: number;
}

export interface Attachment {
  id: string;
  workspace_id?: string; // deprecated, prefer document_id
  document_id?: string;
  upload_by: string;
  filename: string;
  file_type: string;
  file_size: number;
  file_path: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  level: PermissionLevel;
  created_at: string;
  username?: string;
}

export interface DiffLine {
  type: 'equal' | 'insert' | 'delete';
  content: string;
}

export interface LinePatch {
  start_line: number;
  delete_count: number;
  insert_lines: string[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// WebSocket message types
export type WSMessageType = 'init' | 'update' | 'patch' | 'cursor' | 'error' | 'close' | 'ping' | 'pong';

export interface WSMessage {
  type: WSMessageType;
  document_id?: string;
  user_id?: string;
  content?: string;
  payload?: LinePatch;
  timestamp: number;
}
export interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id?: string;
  target_username?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  admin_username?: string;
}

export interface Comment {
  id: string;
  document_id: string;
  author_id: string;
  content: string;
  heading_anchor?: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  author_username?: string;
  replies?: Comment[];
}

export interface AIConversation {
  id: string;
  user_id: string;
  document_id: string;
  title: string;
  created_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
