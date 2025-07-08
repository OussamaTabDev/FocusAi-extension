// Background script to track URL changes
let lastUrl = '';

// Listen for tab updates (navigation events)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url !== lastUrl) {
    lastUrl = tab.url;
    trackUrl(tab.url, tab.title);
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && tab.url !== lastUrl) {
      lastUrl = tab.url;
      trackUrl(tab.url, tab.title);
    }
  });
});

// Function to track URL
function trackUrl(url, title) {
  const timestamp = new Date().toISOString();
  const urlData = {
    url: url,
    title: title || 'Unknown',
    timestamp: timestamp
  };
  
  // Store in local storage
  storeUrlData(urlData);
  
  // Send to Python script
  sendToPython(urlData);
  
  console.log('Tracked URL:', urlData);
}

// Store URL data locally
function storeUrlData(urlData) {
  chrome.storage.local.get(['urlHistory'], (result) => {
    const history = result.urlHistory || [];
    history.push(urlData);
    
    // Keep only last 1000 URLs to prevent storage overflow
    if (history.length > 1000) {
      history.shift();
    }
    
    chrome.storage.local.set({ urlHistory: history });
  });
}

// Send data to Python script via HTTP
function sendToPython(urlData) {
  fetch('http://localhost:8000/track-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(urlData)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    console.log('Successfully sent to Python:', data);
  })
  .catch(error => {
    console.error('Error sending to Python:', error);
    // If Python script is not running, just store locally
  });
}