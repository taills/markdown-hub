// Background service worker for MarkdownHub Importer

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchCsrf') {
    handleFetchCsrf(request.instanceUrl)
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'login') {
    handleLogin(request.instanceUrl, request.username, request.password)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message.message || error.message }));
    return true;
  }

  if (request.action === 'getWorkspaces') {
    handleGetWorkspaces(request.instanceUrl, request.token)
      .then(workspaces => sendResponse({ success: true, workspaces }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'importArticle') {
    handleImport(request.instanceUrl, request.workspaceId, request.title, request.html, request.baseUrl, request.token)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Fetch CSRF token
async function handleFetchCsrf(instanceUrl) {
  // Get CSRF cookie from the instance
  const url = new URL(instanceUrl);
  const cookies = await chrome.cookies.get({
    url: instanceUrl,
    name: 'mh_csrf'
  });

  if (cookies) {
    return cookies.value;
  }

  // If no cookie, fetch to create one
  const response = await fetch(`${instanceUrl}/api/csrf`, {
    credentials: 'include'
  });
  const data = await response.json();
  return data.token;
}

// Login handler
async function handleLogin(instanceUrl, username, password) {
  // Get CSRF token
  let csrfToken = await handleFetchCsrf(instanceUrl);

  // Try to fetch CSRF endpoint first to ensure cookie is set
  await fetch(`${instanceUrl}/api/csrf`, { credentials: 'include' });

  // Get fresh CSRF token from cookie
  const cookies = await chrome.cookies.get({
    url: instanceUrl,
    name: 'mh_csrf'
  });
  if (cookies) {
    csrfToken = cookies.value;
  }

  console.log('Logging in with CSRF:', csrfToken ? csrfToken.substring(0, 10) + '...' : 'none');

  const response = await fetch(`${instanceUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken || ''
    },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });

  const responseText = await response.text();
  console.log('Login response:', response.status, responseText.substring(0, 200));

  if (!response.ok) {
    let error = { error: 'Login failed' };
    try {
      error = JSON.parse(responseText);
    } catch (e) {}
    throw new Error(error.error || 'Login failed');
  }

  // Get token from response
  const data = JSON.parse(responseText);
  return data.token;
}

// Get workspaces
async function handleGetWorkspaces(instanceUrl, token) {
  const response = await fetch(`${instanceUrl}/api/workspaces`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch workspaces');
  }

  return await response.json();
}

// Import article handler
async function handleImport(instanceUrl, workspaceId, title, html, baseUrl, token) {
  // Get CSRF token
  const csrfToken = await handleFetchCsrf(instanceUrl);

  // Import via API
  const response = await fetch(`${instanceUrl}/api/import/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-CSRF-Token': csrfToken
    },
    credentials: 'include',
    body: JSON.stringify({
      workspace_id: workspaceId,
      title: title,
      html: html,
      base_url: baseUrl
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to import article');
  }

  return await response.json();
}

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('MarkdownHub Importer installed');
  }
});
