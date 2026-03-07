import i18n from '@/i18n';
import type { AuthResponse, Document, DocumentListItem, Snapshot, DocumentPermission, HeadingSection, PermissionLevel, DiffLine, Attachment, Workspace, WorkspaceMember, UserStats, User, AdminLog } from '@/types';

const API_BASE_URL = '/api';

// CSRF Token management
let csrfToken = '';

export async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/csrf`);
    if (res.ok) {
      const data = await res.json() as { token: string };
      csrfToken = data.token;
    }
  } catch {
    // CSRF endpoint might not be available (e.g., before login)
    console.warn('Failed to fetch CSRF token');
  }
  return csrfToken;
}

export function getCsrfToken(): string {
  return csrfToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('mh_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  // Add CSRF token for state-changing methods
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() ?? '')) {
    (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function resolveErrorMessage(body: unknown, fallback: string): string {
  const payload = body as { error?: unknown; error_key?: unknown } | null | undefined;
  const key = typeof payload?.error_key === 'string' ? payload.error_key : '';
  if (key) {
    const translated = i18n.t(key);
    if (translated && translated !== key) return translated;
  }
  if (typeof payload?.error === 'string' && payload.error.trim() !== '') return payload.error;
  return fallback;
}

// ---- Auth ----

export const authService = {
  register: (username: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<AuthResponse['user']>('/auth/me'),
};

// ---- Users ----

export const userService = {
  stats: () => request<UserStats>('/users/me/stats'),
  updatePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  updatePreferences: (preferredLanguage: string) =>
    request<AuthResponse['user']>('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_language: preferredLanguage }),
    }),
};

// ---- Documents ----

export const documentService = {
  list: () => request<DocumentListItem[]>('/documents'),
  get: (id: string) => request<Document>(`/documents/${id}`),
  getPublic: async (id: string): Promise<Document> => {
    // Fetch without auth token for anonymous/public access
    const res = await fetch(`${API_BASE_URL}/documents/${id}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
    }
    return res.json() as Promise<Document>;
  },
  getRaw: async (id: string): Promise<string> => {
    const token = localStorage.getItem('mh_token');
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_BASE_URL}/documents/${id}/raw`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
    }
    return res.text();
  },
  create: (title: string, content = '', workspaceId: string) =>
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
  setPublic: (id: string, isPublic: boolean) =>
    request<Document>(`/documents/${id}/public`, {
      method: 'PATCH',
      body: JSON.stringify({ is_public: isPublic }),
    }),
  delete: (id: string) =>
    request<void>(`/documents/${id}`, { method: 'DELETE' }),
  headings: (id: string) => request<HeadingSection[]>(`/documents/${id}/headings`),
  reorder: (ids: string[]) =>
    request<void>('/documents/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
};

// ---- Workspaces ----

export const workspaceService = {
  list: () => request<Workspace[]>('/workspaces'),
  get: (id: string) => request<Workspace>(`/workspaces/${id}`),
  getPublic: async (id: string): Promise<Workspace> => {
    const res = await fetch(`${API_BASE_URL}/workspaces/${id}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
    }
    return res.json() as Promise<Workspace>;
  },
  getPublicDocuments: async (id: string): Promise<Document[]> => {
    const res = await fetch(`${API_BASE_URL}/workspaces/${id}/documents`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
    }
    return res.json() as Promise<Document[]>;
  },
  create: (name: string) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateName: (id: string, name: string) =>
    request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  setPublic: (id: string, isPublic: boolean) =>
    request<Workspace>(`/workspaces/${id}/public`, {
      method: 'PATCH',
      body: JSON.stringify({ is_public: isPublic }),
    }),
  listMembers: (workspaceId: string) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  setMember: (workspaceId: string, username: string, level: PermissionLevel) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ username, level }),
    }),
  removeMember: (workspaceId: string, userId: string) =>
    request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
  reorder: (ids: string[]) =>
    request<void>('/workspaces/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
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
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
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
        throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
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
      throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
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
        throw new Error(resolveErrorMessage(body, `HTTP ${res.status}`));
      }
      return res.blob();
    });
  },
};

// ---- Admin ----

export const adminService = {
  listUsers: () => request<User[]>('/admin/users'),
  setUserAdmin: (id: string, isAdmin: boolean) =>
    request<User>(`/admin/users/${id}/admin`, {
      method: 'PATCH',
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  listAdminLogs: (limit: number = 100, offset: number = 0) =>
    request<AdminLog[]>(`/admin/logs?limit=${limit}&offset=${offset}`),};