// background.js - Manifest V3 Service Worker Compatible

// --- GLOBAL STATE ---
let blockedDomains = [];
let isInitialized = false;

// --- INITIALIZATION ---
// Service workers can be terminated, so we need to handle reinitialization
chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(initialize);

// Also initialize when the service worker starts
if (!isInitialized) {
    initialize();
}

async function initialize() {
    try {
        console.log('Initializing extension...');
        
        // Load blocked domains
        await loadBlockedDomains();
        
        // Set up blocking rules
        await updateBlockingRules();
        
        // Start command polling
        startCommandPolling();
        
        isInitialized = true;
        console.log('Extension initialized successfully');
    } catch (error) {
        console.error('Failed to initialize extension:', error);
    }
}

// --- BLOCKING FUNCTIONALITY ---
async function loadBlockedDomains() {
    try {
        const result = await chrome.storage.sync.get(['blockedDomains']);
        blockedDomains = result.blockedDomains || [];
        console.log('Loaded blocked domains:', blockedDomains.length);
    } catch (error) {
        console.error('Error loading blocked domains:', error);
        blockedDomains = [];
    }
}

async function updateBlockingRules() {
    try {
        if (!chrome.declarativeNetRequest) {
            console.warn('declarativeNetRequest API not available');
            return;
        }

        // Get current dynamic rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules.map(rule => rule.id);

        // Create new rules for enabled domains
        const newRules = [];
        let ruleId = 1;

        const enabledDomains = blockedDomains.filter(domain => domain.enabled);
        
        for (const domainObj of enabledDomains) {
            // Rule for main domain
            newRules.push({
                id: ruleId++,
                priority: 1,
                action: { type: 'block' },
                condition: {
                    urlFilter: `*://*.${domainObj.domain}/*`,
                    resourceTypes: ['main_frame']
                }
            });

            // Rule for exact domain (without subdomain)
            newRules.push({
                id: ruleId++,
                priority: 1,
                action: { type: 'block' },
                condition: {
                    urlFilter: `*://${domainObj.domain}/*`,
                    resourceTypes: ['main_frame']
                }
            });
        }

        // Update rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIdsToRemove,
            addRules: newRules
        });

        console.log(`Updated blocking rules: ${newRules.length} rules for ${enabledDomains.length} domains`);
        
    } catch (error) {
        console.error('Error updating blocking rules:', error);
    }
}

// --- URL TRACKING ---
let lastTrackedUrl = '';

// Track URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url !== lastTrackedUrl) {
        lastTrackedUrl = tab.url;
        trackUrl(tab.url, tab.title);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && tab.url !== lastTrackedUrl) {
            lastTrackedUrl = tab.url;
            trackUrl(tab.url, tab.title);
        }
    } catch (error) {
        console.error('Error tracking activated tab:', error);
    }
});

function trackUrl(url, title) {
    const urlData = {
        url: url,
        title: title || 'Unknown',
        timestamp: new Date().toISOString()
    };
    
    // Store locally
    storeUrlData(urlData);
    
    // Send to Python server
    sendToPython(urlData);
    
    console.log('Tracked URL:', urlData.url);
}

async function storeUrlData(urlData) {
    try {
        const result = await chrome.storage.local.get(['urlHistory']);
        const history = result.urlHistory || [];
        
        history.push(urlData);
        
        // Keep only last 1000 URLs
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
        
        await chrome.storage.local.set({ urlHistory: history });
    } catch (error) {
        console.error('Error storing URL data:', error);
    }
}

// --- TAB MANAGEMENT ---
async function closeTabsByDomain(targetDomain) {
    try {
        const urlPatterns = [
            `*://${targetDomain}/*`,
            `*://www.${targetDomain}/*`
        ];
        
        let closedCount = 0;
        
        for (const pattern of urlPatterns) {
            const tabs = await chrome.tabs.query({ url: pattern });
            if (tabs.length > 0) {
                const tabIds = tabs.map(tab => tab.id);
                await chrome.tabs.remove(tabIds);
                closedCount += tabs.length;
            }
        }
        
        console.log(`Closed ${closedCount} tabs for domain: ${targetDomain}`);
        return { success: true, closed: closedCount };
    } catch (error) {
        console.error('Error closing tabs:', error);
        return { success: false, error: error.message };
    }
}

async function closeTabsByDomains(domains) {
    try {
        if (!domains || domains.length === 0) {
            return { success: true, closed: 0 };
        }
        
        let totalClosed = 0;
        
        for (const domain of domains) {
            const result = await closeTabsByDomain(domain);
            if (result.success) {
                totalClosed += result.closed;
            }
        }
        
        return { success: true, closed: totalClosed };
    } catch (error) {
        console.error('Error closing multiple domain tabs:', error);
        return { success: false, error: error.message };
    }
}

// --- PYTHON INTEGRATION ---
let commandPollingInterval;

function startCommandPolling() {
    // Clear existing interval if any
    if (commandPollingInterval) {
        clearInterval(commandPollingInterval);
    }
    
    // Start polling every 2 seconds (reduced frequency for service workers)
    commandPollingInterval = setInterval(pollForCommands, 2000);
    
    // Also poll immediately
    setTimeout(pollForCommands, 1000);
}

async function pollForCommands() {
    try {
        const response = await fetch('http://localhost:8000/get-commands');
        const data = await response.json();
        
        if (data.commands && data.commands.length > 0) {
            console.log('Received commands:', data.commands);
            
            // Process each command
            for (const command of data.commands) {
                await processCommand(command);
            }
            
            // Clear processed commands
            await fetch('http://localhost:8000/clear-commands', { method: 'POST' });
        }
    } catch (error) {
        // Server might not be running, that's okay
        console.log('Could not fetch commands (server offline)');
    }
}

async function processCommand(command) {
    console.log('Processing command:', command);
    
    try {
        switch (command.action) {
            case 'closeTabsByDomain':
                await closeTabsByDomain(command.domain);
                break;
            case 'closeDistractingTabs':
                await closeTabsByDomains(command.domains || []);
                break;
            default:
                console.warn('Unknown command action:', command.action);
        }
    } catch (error) {
        console.error('Error processing command:', error);
    }
}

async function sendToPython(urlData) {
    try {
        const response = await fetch('http://localhost:8000/track-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(urlData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Successfully sent to Python');
        }
    } catch (error) {
        // Silently fail if Python server is not running
        console.log('Python server not available');
    }
}

// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle async operations properly
    (async () => {
        try {
            switch (request.action) {
                case 'updateBlockingRules':
                    blockedDomains = request.domains || [];
                    await updateBlockingRules();
                    await updateBlockStats();
                    sendResponse({ success: true });
                    break;
                    
                case 'closeTabsByDomain':
                    const targetDomain = request.domain.toLowerCase().replace(/^www\./, '');
                    const result = await closeTabsByDomain(targetDomain);
                    sendResponse(result);
                    break;
                    
                case 'closeDistractingTabs':
                    const normalizedDomains = (request.domains || [])
                        .map(d => d.toLowerCase().replace(/^www\./, ''));
                    const bulkResult = await closeTabsByDomains(normalizedDomains);
                    sendResponse(bulkResult);
                    break;
                    
                case 'getAllTabs':
                    const tabs = await chrome.tabs.query({});
                    const tabInfo = tabs.map(tab => ({
                        id: tab.id,
                        url: tab.url,
                        title: tab.title,
                        domain: tab.url ? new URL(tab.url).hostname.toLowerCase().replace(/^www\./, '') : 'unknown'
                    }));
                    sendResponse({ success: true, tabs: tabInfo });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    
    return true; // Keep message channel open for async response
});

// --- STATISTICS ---
async function updateBlockStats() {
    try {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['blockStats']);
        let blockStats = result.blockStats || { totalBlocksToday: 0, lastReset: today };
        
        // Reset if new day
        if (blockStats.lastReset !== today) {
            blockStats = { totalBlocksToday: 1, lastReset: today };
        } else {
            blockStats.totalBlocksToday++;
        }
        
        await chrome.storage.local.set({ blockStats });
    } catch (error) {
        console.error('Error updating block stats:', error);
    }
}

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
    // This helps keep the service worker alive longer
});

console.log('Background service worker loaded');