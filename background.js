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

// Optimized version - query tabs by URL pattern directly
function closeTabsByDomain(targetDomain, sendResponse) {
  console.log(`Looking for tabs with domain: ${targetDomain}`);
  
  // Use URL pattern matching to reduce the number of tabs we need to check
  const urlPatterns = [
    `*://${targetDomain}/*`,
    `*://www.${targetDomain}/*`
  ];
  
  let closedCount = 0;
  let completedQueries = 0;
  
  urlPatterns.forEach(pattern => {
    chrome.tabs.query({ url: pattern }, (tabs) => {
      completedQueries++;
      
      if (tabs.length > 0) {
        const tabIds = tabs.map(tab => tab.id);
        closedCount += tabs.length;
        
        // Close tabs immediately without waiting
        chrome.tabs.remove(tabIds);
      }
      
      // Send response only after all patterns are checked
      if (completedQueries === urlPatterns.length) {
        if (sendResponse) {
          sendResponse({ 
            success: true, 
            closed: closedCount,
            message: closedCount > 0 ? `Closed ${closedCount} tabs` : 'No matching tabs found'
          });
        }
      }
    });
  });
}

// Batch processing for multiple domains
function closeTabsByDomains(domains, sendResponse) {
  if (!domains || domains.length === 0) {
    if (sendResponse) sendResponse({ success: true, closed: 0 });
    return;
  }
  
  // Create URL patterns for all domains at once
  const urlPatterns = domains.flatMap(domain => [
    `*://${domain}/*`,
    `*://www.${domain}/*`
  ]);
  
  let closedCount = 0;
  let completedQueries = 0;
  const totalQueries = urlPatterns.length;
  
  urlPatterns.forEach(pattern => {
    chrome.tabs.query({ url: pattern }, (tabs) => {
      completedQueries++;
      
      if (tabs.length > 0) {
        const tabIds = tabs.map(tab => tab.id);
        closedCount += tabs.length;
        chrome.tabs.remove(tabIds); // Fire and forget
      }
      
      if (completedQueries === totalQueries) {
        if (sendResponse) {
          sendResponse({ success: true, closed: closedCount });
        }
      }
    });
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


// background.js - Service Worker for blocking functionality

let blockedDomains = [];

// Initialize when extension starts
chrome.runtime.onStartup.addListener(initializeBlocking);
chrome.runtime.onInstalled.addListener(initializeBlocking);

async function initializeBlocking() {
    // Load blocked domains from storage
    const result = await chrome.storage.sync.get(['blockedDomains']);
    blockedDomains = result.blockedDomains || [];
    
    // Set up blocking rules
    updateBlockingRules();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateBlockingRules') {
        blockedDomains = request.domains || [];
        updateBlockingRules();
        sendResponse({ success: true });
    }
});

// Method 1: Using chrome.webRequest (Manifest V2 or V3 with special permissions)
function updateBlockingRules() {
    // Remove existing listener
    if (chrome.webRequest.onBeforeRequest.hasListener(blockRequestHandler)) {
        chrome.webRequest.onBeforeRequest.removeListener(blockRequestHandler);
    }
    
    // Add new listener if we have domains to block
    if (blockedDomains.some(d => d.enabled)) {
        chrome.webRequest.onBeforeRequest.addListener(
            blockRequestHandler,
            { urls: ["<all_urls>"] },
            ["blocking"]
        );
    }
}

function blockRequestHandler(details) {
    try {
        const url = new URL(details.url);
        const domain = url.hostname.replace(/^www\./, '');
        
        // Check if this domain should be blocked
        const shouldBlock = blockedDomains.some(d => 
            d.enabled && isDomainMatch(domain, d.domain)
        );
        
        if (shouldBlock) {
            console.log(`Blocked request to: ${domain}`);
            
            // Update block statistics
            updateBlockStats();
            
            // Show notification (optional)
            if (chrome.notifications) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Domain Blocked',
                    message: `Access to ${domain} has been blocked`
                });
            }
            
            return { cancel: true };
        }
        
        return { cancel: false };
    } catch (error) {
        console.error('Error in block handler:', error);
        return { cancel: false };
    }
}

function isDomainMatch(requestDomain, blockedDomain) {
    requestDomain = requestDomain.toLowerCase();
    blockedDomain = blockedDomain.toLowerCase();
    
    // Exact match
    if (requestDomain === blockedDomain) return true;
    
    // Subdomain match
    if (requestDomain.endsWith('.' + blockedDomain)) return true;
    
    return false;
}

async function updateBlockStats() {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['blockStats']);
    let blockStats = result.blockStats || { totalBlocksToday: 0, lastReset: today };
    
    // Reset if new day
    if (blockStats.lastReset !== today) {
        blockStats = { totalBlocksToday: 0, lastReset: today };
    }
    
    blockStats.totalBlocksToday++;
    await chrome.storage.local.set({ blockStats });
}

// Method 2: Alternative using Declarative Net Request (Manifest V3 preferred)
// Uncomment this section if you prefer using declarativeNetRequest

/*
async function updateBlockingRulesDeclarative() {
    // Clear existing rules
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: await getAllRuleIds()
    });
    
    // Add new rules for enabled domains
    const rules = [];
    let ruleId = 1;
    
    blockedDomains.forEach(domainObj => {
        if (domainObj.enabled) {
            rules.push({
                id: ruleId++,
                priority: 1,
                action: { type: "block" },
                condition: {
                    urlFilter: `*://*.${domainObj.domain}/*`,
                    resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
                }
            });
        }
    });
    
    if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules
        });
    }
}

async function getAllRuleIds() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map(rule => rule.id);
}
*/