// Content script for MarkdownHub Importer
// Extracts page content for import

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    extractContent().then(content => {
      sendResponse(content);
    }).catch(err => {
      console.error('Failed to extract content:', err);
      sendResponse({ error: err.message });
    });
    return true; // Keep message channel open for async response
  }
  return true;
});

// Extract main content from the page
async function extractContent() {
  // Try to find the main content area
  let content = null;
  let title = document.title;

  // Common selectors for main content
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article'
  ];

  for (const selector of contentSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 200) {
      content = el.cloneNode(true);
      break;
    }
  }

  // Fallback to body
  if (!content) {
    content = document.body.cloneNode(true);
  }

  // Remove unwanted elements
  const unwantedSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'aside',
    '.sidebar',
    '.advertisement',
    '.ad',
    '.ads',
    '.social-share',
    '.comments',
    '.related-posts',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]'
  ];

  unwantedSelectors.forEach(selector => {
    content.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Get the title from h1 if available
  const h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim()) {
    title = h1.textContent.trim();
  }

  // Extract images as base64
  const images = Array.from(content.querySelectorAll('img'));
  const imagePromises = images.map(async (img) => {
    try {
      if (img.src && img.src.startsWith('http')) {
        // Try to convert to base64
        const base64 = await imageToBase64(img.src);
        if (base64) {
          img.src = base64;
        }
      }
    } catch (e) {
      // Keep original src if conversion fails
      console.warn('Failed to convert image to base64:', img.src, e);
    }
  });

  // Wait for all images to be processed
  await Promise.all(imagePromises);

  return {
    title: title,
    html: content.innerHTML
  };
}

// Convert image URL to base64
async function imageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        resolve(dataURL);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}
