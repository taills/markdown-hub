export type PermissionLevel = 'read' | 'edit' | 'manage';

export interface User {
  id: string;
  username: string;
  email: string;
  preferred_language: string;
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
  workspace_id: string;
  owner_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItem {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  permission?: PermissionLevel; // only present if not owner
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
  workspace_id: string;
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
export type WSMessageType = 'init' | 'update' | 'patch' | 'cursor' | 'error' | 'close';

export interface WSMessage {
  type: WSMessageType;
  document_id?: string;
  user_id?: string;
  content?: string;
  payload?: LinePatch;
  timestamp: number;
}
