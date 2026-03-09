// Popup script for MarkdownHub Importer

const DEFAULT_INSTANCE_URL = 'http://localhost:8080';

let instanceUrl = DEFAULT_INSTANCE_URL;
let authToken = null;

// DOM Elements
const statusEl = document.getElementById('status');
const loginForm = document.getElementById('loginForm');
const importForm = document.getElementById('importForm');
const workspaceSelect = document.getElementById('workspaceSelect');
const titleInput = document.getElementById('titleInput');
const importBtn = document.getElementById('importBtn');
const instanceUrlInput = document.getElementById('instanceUrl');
const settingsInstanceUrlInput = document.getElementById('settingsInstanceUrl');
const saveSettingsBtn = document.getElementById('saveSettings');
const updateSettingsBtn = document.getElementById('updateSettings');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

// Show status message
function showStatus(message, type = 'loading') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}

// Hide status
function hideStatus() {
  statusEl.classList.add('hidden');
}

// Send message to background script
function sendToBackground(action, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

// Initialize popup
async function init() {
  console.log('Initializing popup...');

  // Load saved instance URL
  const stored = await chrome.storage.local.get('instanceUrl');
  if (stored.instanceUrl) {
    instanceUrl = stored.instanceUrl;
    instanceUrlInput.value = instanceUrl;
    settingsInstanceUrlInput.value = instanceUrl;
  }

  // Show login form by default
  loginForm.classList.remove('hidden');
  importForm.classList.add('hidden');
}

// Login handler
loginBtn.addEventListener('click', async () => {
  const url = instanceUrlInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!url) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }
  if (!username || !password) {
    showStatus('Please enter username and password', 'error');
    return;
  }

  instanceUrl = url;
  await chrome.storage.local.set({ instanceUrl });

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    showStatus('Logging in...', 'loading');

    // Use background script to login
    const response = await sendToBackground('login', {
      instanceUrl,
      username,
      password
    });

    authToken = response.result;
    console.log('Login successful, token:', authToken.substring(0, 20) + '...');

    showStatus('Login successful!', 'success');

    // Get workspaces
    loginForm.classList.add('hidden');
    importForm.classList.remove('hidden');

    showStatus('Loading workspaces...', 'loading');
    const workspacesResponse = await sendToBackground('getWorkspaces', {
      instanceUrl,
      token: authToken
    });

    const workspaces = workspacesResponse.workspaces;
    workspaceSelect.innerHTML = '';
    if (workspaces.length === 0) {
      workspaceSelect.innerHTML = '<option value="">No workspaces found</option>';
    } else {
      workspaces.forEach(ws => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name;
        workspaceSelect.appendChild(option);
      });
    }
    hideStatus();
  } catch (e) {
    console.error('Login error:', e);
    showStatus('Login failed: ' + e.message, 'error');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

// Import button handler
importBtn.addEventListener('click', async () => {
  const workspaceId = workspaceSelect.value;
  if (!workspaceId) {
    showStatus('Please select a workspace', 'error');
    return;
  }

  const title = titleInput.value.trim();

  importBtn.disabled = true;
  importBtn.textContent = 'Importing...';

  try {
    showStatus('Getting page content...', 'loading');

    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script to get page content
    const pageContent = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' });

    if (!pageContent || !pageContent.html) {
      throw new Error('Failed to get page content');
    }

    showStatus('Importing article...', 'loading');

    // Import via background script
    const response = await sendToBackground('importArticle', {
      instanceUrl,
      workspaceId,
      title: title || pageContent.title,
      html: pageContent.html,
      baseUrl: tab.url,
      token: authToken
    });

    showStatus('Article imported successfully!', 'success');

    // Open the document in a new tab
    chrome.tabs.create({ url: `${instanceUrl}/documents/${response.result.document_id}` });

    // Reset button
    importBtn.disabled = false;
    importBtn.textContent = 'Import Article';
  } catch (e) {
    console.error('Import error:', e);
    showStatus('Import failed: ' + e.message, 'error');
    importBtn.disabled = false;
    importBtn.textContent = 'Import Article';
  }
});

// Settings buttons
saveSettingsBtn.addEventListener('click', async () => {
  const url = instanceUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }

  instanceUrl = url;
  await chrome.storage.local.set({ instanceUrl });
  init();
});

updateSettingsBtn.addEventListener('click', async () => {
  const url = settingsInstanceUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }

  instanceUrl = url;
  await chrome.storage.local.set({ instanceUrl });
  init();
});

// Initialize on load
init();
