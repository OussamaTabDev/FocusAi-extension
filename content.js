// Content script to track URL changes within the same tab
let currentUrl = location.href;

// Track initial page load
trackPageChange();

// Listen for URL changes (for single-page applications)
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    trackPageChange();
  }
}, 1000);

// Also listen for history changes (back/forward buttons)
window.addEventListener('popstate', trackPageChange);

function trackPageChange() {
  const urlData = {
    url: location.href,
    title: document.title,
    timestamp: new Date().toISOString()
  };
  
  // Send to background script
  chrome.runtime.sendMessage({
    action: 'trackUrl',
    data: urlData
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentUrl') {
    sendResponse({
      url: location.href,
      title: document.title
    });
  }
});