import type { AuthResponse, Document, DocumentListItem, Snapshot, DocumentPermission, HeadingSection, PermissionLevel, DiffLine, Attachment, Workspace, WorkspaceMember } from '@/types';

const API_BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('mh_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Auth ----

export const authService = {
  register: (username: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthResponse['user']>('/auth/me'),
};

// ---- Documents ----

export const documentService = {
  list: () => request<DocumentListItem[]>('/documents'),
  get: (id: string) => request<Document>(`/documents/${id}`),
  create: (title: string, content = '', workspaceId?: string) =>
    request<Document>('/documents', {
      method: 'POST',
      body: JSON.stringify({ title, content, workspace_id: workspaceId }),
    }),
  updateContent: (id: string, content: string) =>
    request<Document>(`/documents/${id}/content`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  updateTitle: (id: string, title: string) =>
    request<Document>(`/documents/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  delete: (id: string) =>
    request<void>(`/documents/${id}`, { method: 'DELETE' }),
  headings: (id: string) => request<HeadingSection[]>(`/documents/${id}/headings`),
};

// ---- Workspaces ----

export const workspaceService = {
  list: () => request<Workspace[]>('/workspaces'),
  get: (id: string) => request<Workspace>(`/workspaces/${id}`),
  create: (name: string) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  setDefault: (id: string) =>
    request<AuthResponse['user']>(`/workspaces/${id}/default`, { method: 'PUT' }),
  listMembers: (workspaceId: string) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  setMember: (workspaceId: string, username: string, level: PermissionLevel) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ username, level }),
    }),
  removeMember: (workspaceId: string, userId: string) =>
    request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
};

// ---- Snapshots ----

export const snapshotService = {
  list: (documentId: string, limit = 20, offset = 0) =>
    request<Snapshot[]>(`/documents/${documentId}/snapshots?limit=${limit}&offset=${offset}`),
  create: (documentId: string, message: string) =>
    request<Snapshot>(`/documents/${documentId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  restore: (snapshotId: string) =>
    request<Document>(`/snapshots/${snapshotId}/restore`, { method: 'POST' }),
  diff: (snapshotId: string, compareId?: string) => {
    const qs = compareId ? `?compare=${compareId}` : '';
    return request<DiffLine[]>(`/snapshots/${snapshotId}/diff${qs}`);
  },
};

// ---- Permissions ----

export const permissionService = {
  list: (documentId: string) =>
    request<DocumentPermission[]>(`/documents/${documentId}/permissions`),
  set: (documentId: string, username: string, level: PermissionLevel) =>
    request<DocumentPermission>(`/documents/${documentId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ username, level }),
    }),
  remove: (documentId: string, userId: string) =>
    request<void>(`/documents/${documentId}/permissions/${userId}`, { method: 'DELETE' }),
  setHeading: (documentId: string, userId: string, anchor: string, level: PermissionLevel) =>
    request(`/documents/${documentId}/permissions/${userId}/headings/${anchor}`, {
      method: 'PUT',
      body: JSON.stringify({ level }),
    }),
};

// ---- Attachments ----

export const attachmentService = {
  list: (documentId: string) =>
    request<Attachment[]>(`/documents/${documentId}/attachments`),
  upload: async (documentId: string, file: File): Promise<Attachment> => {
    const token = localStorage.getItem('mh_token');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/documents/${documentId}/attachments`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<Attachment>;
  },
  delete: (documentId: string, attachmentId: string) =>
    request<void>(`/documents/${documentId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  getUnreferenced: (documentId: string) =>
    request<Attachment[]>(`/documents/${documentId}/attachments/unreferenced`),
  download: (attachmentId: string) => {
    const token = localStorage.getItem('mh_token');
    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const url = `${API_BASE_URL}/attachments/${attachmentId}/download`;
    return fetch(url, { headers }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.blob();
    });
  },
};

// ---- Workspace Attachments ----

export const workspaceAttachmentService = {
  list: (workspaceId: string) =>
    request<Attachment[]>(`/workspaces/${workspaceId}/attachments`),
  upload: async (workspaceId: string, file: File): Promise<Attachment> => {
    const token = localStorage.getItem('mh_token');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/attachments`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<Attachment>;
  },
  delete: (workspaceId: string, attachmentId: string) =>
    request<void>(`/workspaces/${workspaceId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  download: (attachmentId: string) => {
    const token = localStorage.getItem('mh_token');
    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const url = `${API_BASE_URL}/workspace-attachments/${attachmentId}/download`;
    return fetch(url, { headers }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.blob();
    });
  },
};
