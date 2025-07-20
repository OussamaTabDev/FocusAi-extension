// Listen for messages from popup or Python
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'closeTabsByDomain') {
    const targetDomain = request.domain.toLowerCase().replace(/^www\./, '');
    closeTabsByDomain(targetDomain, sendResponse);
    return true;
  }

  if (request.action === 'closeDistractingTabs') {
    const distractingDomains = request.domains || [];
    const normalizedDomains = distractingDomains.map(d => d.toLowerCase().replace(/^www\./, ''));
    closeTabsByDomains(normalizedDomains, sendResponse);
    return true;
  }

  if (request.action === 'getAllTabs') {
    chrome.tabs.query({}, (tabs) => {
      const tabInfo = tabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        domain: tab.url ? new URL(tab.url).hostname.toLowerCase().replace(/^www\./, '') : 'unknown'
      }));
      sendResponse({ success: true, tabs: tabInfo });
    });
    return true;
  }
});

// Function to close tabs by domain
function closeTabsByDomain(targetDomain, sendResponse) {
  console.log(`Looking for tabs with domain: ${targetDomain}`);
  
  chrome.tabs.query({}, (tabs) => {
    const toClose = tabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        const tabDomain = url.hostname.toLowerCase().replace(/^www\./, '');
        
        console.log(`Comparing: ${tabDomain} === ${targetDomain}`);
        return tabDomain === targetDomain;
      } catch (error) {
        console.error('Error parsing URL:', tab.url, error);
        return false;
      }
    });

    console.log(`Found ${toClose.length} tabs to close for domain: ${targetDomain}`);
    toClose.forEach(tab => console.log(`Will close: ${tab.url}`));

    const tabIds = toClose.map(tab => tab.id);
    
    if (tabIds.length > 0) {
      chrome.tabs.remove(tabIds, () => {
        if (chrome.runtime.lastError) {
          console.error('Error closing tabs:', chrome.runtime.lastError);
          if (sendResponse) sendResponse({ success: false, error: chrome.runtime.lastError.message, closed: 0 });
        } else {
          console.log(`Successfully closed ${tabIds.length} tabs`);
          if (sendResponse) sendResponse({ success: true, closed: tabIds.length });
        }
      });
    } else {
      console.log('No matching tabs found');
      if (sendResponse) sendResponse({ success: true, closed: 0, message: 'No matching tabs found' });
    }
  });
}

// Function to close tabs by multiple domains
function closeTabsByDomains(domains, sendResponse) {
  chrome.tabs.query({}, (tabs) => {
    const toClose = tabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        const tabDomain = url.hostname.toLowerCase().replace(/^www\./, '');
        return domains.includes(tabDomain);
      } catch {
        return false;
      }
    });

    const tabIds = toClose.map(tab => tab.id);
    
    if (tabIds.length > 0) {
      chrome.tabs.remove(tabIds, () => {
        if (chrome.runtime.lastError) {
          if (sendResponse) sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          if (sendResponse) sendResponse({ success: true, closed: tabIds.length });
        }
      });
    } else {
      if (sendResponse) sendResponse({ success: true, closed: 0 });
    }
  });
}

// Poll for commands from Python server
function pollForCommands() {
  fetch('http://localhost:8000/get-commands')
    .then(response => response.json())
    .then(data => {
      if (data.commands && data.commands.length > 0) {
        console.log('Received commands:', data.commands);
        
        // Process each command
        data.commands.forEach(command => {
          processCommand(command);
        });
        
        // Clear processed commands
        fetch('http://localhost:8000/clear-commands', { method: 'POST' })
          .catch(error => console.error('Error clearing commands:', error));
      }
    })
    .catch(error => {
      // Server might not be running, that's okay
      console.log('Could not fetch commands (server might be offline)');
    });
}

// Process individual command
function processCommand(command) {
  console.log('Processing command:', command);
  
  switch (command.action) {
    case 'closeTabsByDomain':
      closeTabsByDomain(command.domain);
      break;
    case 'closeDistractingTabs':
      closeTabsByDomains(command.domains || []);
      break;
    default:
      console.warn('Unknown command action:', command.action);
  }
}

// Start polling when extension loads
console.log('Starting command polling...');
setInterval(pollForCommands, 1000); // Poll every second

// Also poll immediately on startup
setTimeout(pollForCommands, 1000);

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
  });
}