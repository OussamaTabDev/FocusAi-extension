// popup.js - Updated for URL Explorer design

// --- GLOBAL STATE ---
let currentPage = 1;
let itemsPerPage = 10; // Items per page for history view
let allHistory = [];
let filteredHistory = [];
const SETTINGS_KEY = 'urlExplorerSettings';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    setupEventListeners();
    loadAndDisplayAllData(); // Main data loading function
    loadSettings();
});

/**
 * Sets up tab navigation functionality.
 */
function initializeTabs() {
    const navButtons = document.querySelectorAll('.nav-button');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Deactivate all buttons and tabs
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Activate the clicked button and corresponding tab
            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');

            // Lazy load data for the active tab
            switch (tabName) {
                case 'history':
                    loadHistoryTab();
                    break;
                case 'domains':
                    loadDomainsTab();
                    break;
            }
        });
    });
}

/**
 * Central function to attach all event listeners.
 */
function setupEventListeners() {
    // Dashboard Tab
    document.getElementById('exportBtn')?.addEventListener('click', exportUrls);
    document.getElementById('analyticsBtn')?.addEventListener('click', () => showToast('Analytics feature coming soon!'));
    document.getElementById('backupBtn')?.addEventListener('click', () => showToast('Backup feature coming soon!'));

    // History Tab
    document.getElementById('searchInput')?.addEventListener('input', filterHistory);
    document.getElementById('timeFilter')?.addEventListener('change', filterHistory);
    document.getElementById('exportHistoryBtn')?.addEventListener('click', exportUrls);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);
    document.getElementById('prevPage')?.addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage')?.addEventListener('click', () => changePage(1));

    // Blocking
    document.getElementById('addDomainBtn')?.addEventListener('click', () => this.focusDomainInput());
    document.getElementById('addDomainSubmit')?.addEventListener('click', () => this.addBlockedDomain());
    document.getElementById('domainInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addBlockedDomain();
    });
    document.getElementById('importBlocklistBtn')?.addEventListener('click', () => this.importBlocklist());
    document.getElementById('toggleAllBlocking')?.addEventListener('click', () => this.toggleAllBlocking());


    // Domains Tab
    document.getElementById('domainReportBtn')?.addEventListener('click', () => showToast('Domain reports coming soon!'));

    // Settings Tab
    document.getElementById('saveSettings')?.addEventListener('click', saveSettings);
    document.getElementById('exportAllBtn')?.addEventListener('click', exportUrls);
    document.getElementById('clearAllBtn')?.addEventListener('click', clearHistory);
}

// --- DATA LOADING & DISPLAY ---

/**
 * Loads all data from storage and updates all relevant UI sections.
 */
function loadAndDisplayAllData() {
    chrome.storage.local.get(['urlHistory'], (result) => {
        allHistory = result.urlHistory || [];
        filteredHistory = [...allHistory]; // Initially, filtered is all

        updateDashboardStats();
        loadRecentActivity();
        testConnectionStatus(); // Check connection status on load

        // Pre-load the visible tab's dynamic content
        if (document.getElementById('history-tab').classList.contains('active')) {
            loadHistoryTab();
        }
        if (document.getElementById('domains-tab').classList.contains('active')) {
            loadDomainsTab();
        }
    });
}

/**
 * Updates the statistics on the Dashboard tab.
 */
function updateDashboardStats() {
    const totalCount = allHistory.length;
    const uniqueDomains = new Set(allHistory.map(item => extractDomain(item.url))).size;

    // Today's stats
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayHistory = allHistory.filter(item => new Date(item.timestamp) >= startOfToday);
    const todayCount = todayHistory.length;
    
    // Yesterday's stats for growth calculation
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayHistory = allHistory.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startOfYesterday && itemDate < startOfToday;
    });
    const yesterdayCount = yesterdayHistory.length;

    // Calculate growth rate
    let growthRate = 0;
    if (yesterdayCount > 0) {
        growthRate = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
    } else if (todayCount > 0) {
        growthRate = 100; // If yesterday was 0 and today is > 0, show 100% growth
    }
    const growthSign = growthRate >= 0 ? '+' : '';

    // Update UI elements
    document.getElementById('totalUrls').textContent = totalCount;
    document.getElementById('totalDomains').textContent = uniqueDomains;
    document.getElementById('todayCount').textContent = todayCount;
    document.getElementById('growthRate').textContent = `${growthSign}${growthRate.toFixed(0)}%`;
}


/**
 * Loads the 5 most recent URLs into the "Recent Activity" list on the dashboard.
 */
function loadRecentActivity() {
    const recentActivity = allHistory.slice(-5).reverse();
    const activityList = document.getElementById('recentActivity');
    activityList.innerHTML = ''; // Clear previous items

    if (recentActivity.length === 0) {
        activityList.innerHTML = '<div class="no-data-message">No activity recorded yet.</div>';
        return;
    }

    recentActivity.forEach(item => {
        const activityItem = createActivityItem(item);
        activityList.appendChild(activityItem);
    });
}


/**
 * Loads and displays the full history based on current filters and page.
 */
function loadHistoryTab() {
    if (document.getElementById('history-tab').classList.contains('active')) {
        currentPage = 1; // Reset to page 1 when tab is loaded/refreshed
        filterHistory();
    }
}


/**
 * Loads and displays the domain analytics.
 */
function loadDomainsTab() {
    if (!document.getElementById('domains-tab').classList.contains('active')) {
        return;
    }
    
    const domainCounts = {};
    allHistory.forEach(item => {
        const domain = extractDomain(item.url);
        if (domain !== 'unknown') {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
    });

    const sortedDomains = Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a);

    const domainsList = document.getElementById('domainsList');
    domainsList.innerHTML = ''; // Clear previous list

    // Update domain stats
    document.getElementById('domainsTotal').textContent = sortedDomains.length;
    document.getElementById('topDomain').textContent = sortedDomains.length > 0 ? sortedDomains[0][0] : 'N/A';

    if (sortedDomains.length === 0) {
        domainsList.innerHTML = '<div class="no-data-message">No domains found.</div>';
        return;
    }
    
    // Display top 5 domains
    sortedDomains.slice(0, 5).forEach(([domain, count]) => {
        const domainItem = createDomainItem(domain, count);
        domainsList.appendChild(domainItem);
    });
}


// --- UI ELEMENT CREATION ---

/**
 * Creates an HTML element for a recent activity item.
 */
function createActivityItem(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'activity-item';
    const domain = extractDomain(item.url);
    const timeAgo = formatTimeAgo(item.timestamp);

    itemEl.innerHTML = `
        <img src="https://www.google.com/s2/favicons?domain=${domain}" class="activity-favicon" alt="favicon">
        <div class="activity-info">
            <div class="activity-title">${item.title || 'No Title'}</div>
            <div class="activity-meta">${domain} &middot; ${timeAgo}</div>
        </div>
    `;
    itemEl.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    return itemEl;
}

/**
 * Creates an HTML element for a history list item.
 */
function createHistoryItem(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    const domain = extractDomain(item.url);

    itemEl.innerHTML = `
        <img src="https://www.google.com/s2/favicons?domain=${domain}" class="history-favicon" alt="favicon">
        <div class="history-content">
            <div class="history-title">${item.title || 'No Title'}</div>
            <div class="history-url">${item.url}</div>
        </div>
        <div class="history-meta">
            <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
        </div>
    `;
    itemEl.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    return itemEl;
}

/**
 * Creates an HTML element for a domain list item.
 */
function createDomainItem(domain, count) {
    const itemEl = document.createElement('div');
    itemEl.className = 'domain-list-item';
    
    // itemEl.innerHTML = `
    //   <div class="domain-info">
    //     <img src="https://www.google.com/s2/favicons?domain=${domain}" class="domain-favicon" alt="favicon">
    //     <span class="domain-name">${domain}</span>
    //   </div>
    //   <span class="domain-count">${count}</span>
    // `;

    itemEl.innerHTML = `
      <div class="card">
            <div class="card-content">
                <div class="flex items-center gap-3">
                    <div class="icon-container">
                    </div>
                    <img src="https://www.google.com/s2/favicons?domain=${domain}" class="domain-favicon" alt="favicon">
                    <div>
                        <p class="text-sm text-muted">${domain}</p>
                        <p class="text-2xl font-bold">${count}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add click handler to filter history by this domain
    itemEl.addEventListener('click', () => {
        document.querySelector('[data-tab="history"]').click();
        setTimeout(() => {
            document.getElementById('searchInput').value = domain;
            filterHistory();
        }, 100); // Timeout to allow tab switch animation
    });

    return itemEl;
}


// --- HISTORY FILTERING & PAGINATION ---

/**
 * Filters the history based on search and time dropdown.
 */
function filterHistory() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterType = document.getElementById('timeFilter').value;

    let filtered = [...allHistory];

    // Apply time filter
    if (filterType !== 'all') {
        const now = new Date();
        let cutoffDate;
        switch (filterType) {
            case 'today':
                cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }
        filtered = filtered.filter(item => new Date(item.timestamp) >= cutoffDate);
    }

    // Apply search term filter
    if (searchTerm) {
        filtered = filtered.filter(item =>
            item.url.toLowerCase().includes(searchTerm) ||
            (item.title && item.title.toLowerCase().includes(searchTerm)) ||
            extractDomain(item.url).toLowerCase().includes(searchTerm)
        );
    }
    
    // Sort newest first
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    filteredHistory = filtered;
    currentPage = 1; // Reset to first page after filtering
    displayHistoryPage();
    updateHistoryStats();
}


/**
 * Displays the current page of the filtered history.
 */
function displayHistoryPage() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (filteredHistory.length === 0) {
        historyList.innerHTML = '<div class="no-data-message">No matching history found.</div>';
        updatePagination();
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredHistory.slice(startIndex, endIndex);

    pageItems.forEach(item => {
        const historyItem = createHistoryItem(item);
        historyList.appendChild(historyItem);
    });

    updatePagination();
}

/**
 * Updates the history stats text (e.g., "150 URLs found").
 */
function updateHistoryStats() {
    const count = filteredHistory.length;
    document.getElementById('historyCount').textContent = `${count} URL${count === 1 ? '' : 's'} found`;
}


/**
 * Updates pagination controls (buttons, page info text).
 */
function updatePagination() {
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages || totalPages === 0;
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('pagination').style.display = totalPages > 1 ? 'flex' : 'none';
}

/**
 * Changes the current page for history view.
 * @param {number} direction - 1 for next, -1 for previous.
 */
function changePage(direction) {
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayHistoryPage();
    }
}


// --- ACTIONS & UTILITIES ---

/**
 * Clears all stored URL history.
 */
function clearHistory() {
    if (confirm('Are you sure you want to clear ALL Browse history? This action cannot be undone.')) {
        chrome.storage.local.set({ 'urlHistory': [] }, () => {
            allHistory = [];
            filteredHistory = [];
            loadAndDisplayAllData();
            loadHistoryTab();
            loadDomainsTab();
            showToast('History cleared successfully!', 'success');
        });
    }
}

/**
 * Exports all history to a JSON file.
 */
function exportUrls() {
    if (allHistory.length === 0) {
        showToast('No data to export.', 'warning');
        return;
    }
    const dataStr = JSON.stringify(allHistory, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `url_explorer_history_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported.', 'success');
}


/**
 * Checks connection to a backend server (example).
 */
function testConnectionStatus() {
    const indicator = document.getElementById('statusIndicator');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('span');
    
    dot.style.backgroundColor = '#f1c40f'; // Yellow for checking
    text.textContent = 'Checking...';

    fetch('http://localhost:8000/ping')
        .then(response => {
            if (!response.ok) throw new Error('Not connected');
            return response.json();
        })
        .then(data => {
            dot.style.backgroundColor = '#2ecc71'; // Green for connected
            text.textContent = 'Connected';
        })
        .catch(error => {
            dot.style.backgroundColor = '#e74c3c'; // Red for disconnected
            text.textContent = 'Offline';
        });
}

/**
 * Extracts the domain name from a URL.
 * @param {string} url - The URL to parse.
 * @returns {string} The extracted domain.
 */
function extractDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return 'unknown';
    }
}

/**
 * Formats a timestamp into a "time ago" string.
 */
function formatTimeAgo(timestamp) {
    const now = new Date();
    const seconds = Math.floor((now - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

// --- SETTINGS ---

/**
 * Loads settings from chrome.storage.sync.
 */
function loadSettings() {
    // This is a placeholder for actual settings functionality
    // Example:
    // chrome.storage.sync.get([SETTINGS_KEY], (result) => {
    //   const settings = result[SETTINGS_KEY] || {};
    //   document.getElementById('enableTracking').checked = settings.trackingEnabled ?? true;
    // });
}

/**
 * Saves settings to chrome.storage.sync.
 */
function saveSettings() {
    // const settings = {
    //   trackingEnabled: document.getElementById('enableTracking').checked,
    //   notificationsEnabled: document.getElementById('enableNotifications').checked,
    //   autoBackup: document.getElementById('autoBackup').checked,
    //   dataRetention: document.getElementById('dataRetention').value,
    // };
    // chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
    //   showToast('Settings saved!', 'success');
    // });
    showToast('Settings saved!', 'success');
}


// --- NOTIFICATIONS ---

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'warning' (affects styling).
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
        }, 500);
    }, 3000);
}

// ---- Blocking Functions ----



// DOM elements
const addDomainBtn = document.getElementById('addDomainBtn');
const importBlocklistBtn = document.getElementById('importBlocklistBtn');
const domainInput = document.getElementById('domainInput');
const addDomainSubmit = document.getElementById('addDomainSubmit');
const blockedDomainsList = document.getElementById('blockedDomainsList');
const blockedCount = document.getElementById('blockedCount');
const blocksToday = document.getElementById('blocksToday');
const toggleAllBlocking = document.getElementById('toggleAllBlocking');
const domainSuggestions = document.getElementById('domainSuggestions');

// State
let blockedDomains = [];
let blockStats = {
    totalBlocksToday: 0,
    lastReset: new Date().toDateString()
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Load saved data
    await loadBlockedDomains();
    await loadBlockStats();
    
    // Update UI
    updateBlockedDomainsList();
    updateStats();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start web request listener for actual blocking
    setupWebRequestListener();
}

function setupEventListeners() {
    // Add domain button
    addDomainBtn.addEventListener('click', () => {
        domainInput.focus();
    });
    
    // Import blocklist button
    importBlocklistBtn.addEventListener('click', importBlocklist);
    
    // Add domain form submission
    addDomainSubmit.addEventListener('click', addDomain);
    domainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });
    
    // Toggle all blocking
    toggleAllBlocking.addEventListener('click', toggleAllDomains);
    
    // Load domain suggestions
    loadDomainSuggestions();
}

// Blocking functionality
// Updated webRequest listener
function setupWebRequestListener() {
    if (!chrome.webRequest?.onBeforeRequest) {
        console.error("webRequest API not available");
        return;
    }

    // Remove existing listener if any to avoid duplicates
    chrome.webRequest.onBeforeRequest.removeListener(handleWebRequest);
    
    // Add new listener
    chrome.webRequest.onBeforeRequest.addListener(
        handleWebRequest,
        { urls: ["<all_urls>"] },
        ["blocking"]
    );
}

// Separate handler function for better organization
function handleWebRequest(details) {
    try {
        let url;
        try {
            url = new URL(details.url);
        } catch (e) {
            // Invalid URL, allow it
            return { cancel: false };
        }

        const domain = url.hostname;
        
        // Check if domain is blocked and enabled
        const isBlocked = blockedDomains.some(d => 
            d.enabled && isDomainMatch(domain, d.domain)
        );

        if (isBlocked) {
            // Update stats
            blockStats.totalBlocksToday++;
            updateStats();
            saveBlockStats();
            
            // Show block notification
            showBlockNotification(domain);
            
            return { cancel: true };
        }
        
        return { cancel: false };
    } catch (error) {
        console.error("Error in request handler:", error);
        return { cancel: false };
    }
}

// Improved domain matching
function isDomainMatch(requestDomain, blockedDomain) {
    // Normalize domains to lowercase
    requestDomain = requestDomain.toLowerCase();
    blockedDomain = blockedDomain.toLowerCase();
    
    // Exact match
    if (requestDomain === blockedDomain) return true;
    
    // Subdomain match (e.g., www.example.com matches example.com)
    if (requestDomain.endsWith('.' + blockedDomain)) return true;
    
    // Special case for domains starting with www.
    if (blockedDomain.startsWith('www.')) {
        const withoutWww = blockedDomain.substring(4);
        return requestDomain === withoutWww || requestDomain.endsWith('.' + withoutWww);
    }
    
    return false;
}

// Update initialization
async function init() {
    // Load saved data
    await loadBlockedDomains();
    await loadBlockStats();
    
    // Update UI
    updateBlockedDomainsList();
    updateStats();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start web request listener for actual blocking
    setupWebRequestListener();
    
    // Check if we have permission
    checkPermissions();
}

// Permission check
async function checkPermissions() {
    if (!chrome.permissions?.contains) return;
    
    const requiredPermissions = {
        origins: ["<all_urls>"],
        permissions: ["webRequest", "webRequestBlocking"]
    };
    
    const hasPermissions = await chrome.permissions.contains(requiredPermissions);
    if (!hasPermissions) {
        console.warn("Missing required permissions for blocking");
        showError("Extension needs additional permissions to block websites");
    }
}

function showBlockNotification(domain) {
    if (!chrome.notifications) return;
    
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Domain Blocked',
        message: `Access to ${domain} has been blocked`
    });
}

// Domain management
async function loadBlockedDomains() {
    const result = await chrome.storage.sync.get('blockedDomains');
    blockedDomains = result.blockedDomains || [];
}

async function saveBlockedDomains() {
    await chrome.storage.sync.set({ blockedDomains });
    updateBlockedCount();
}

async function loadBlockStats() {
    const result = await chrome.storage.local.get('blockStats');
    if (result.blockStats) {
        // Reset stats if it's a new day
        if (result.blockStats.lastReset !== new Date().toDateString()) {
            blockStats = {
                totalBlocksToday: 0,
                lastReset: new Date().toDateString()
            };
        } else {
            blockStats = result.blockStats;
        }
    }
}

async function saveBlockStats() {
    await chrome.storage.local.set({ blockStats });
}

function addDomain() {
    let domain = domainInput.value.trim();
    
    if (!domain) return;
    
    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove path if present
    domain = domain.split('/')[0];
    
    // Remove www. if present for consistency
    domain = domain.replace(/^www\./, '');
    
    // Validate domain
    if (!isValidDomain(domain)) {
        showError("Please enter a valid domain (e.g., example.com)");
        return;
    }
    
    // Check if domain already exists
    if (blockedDomains.some(d => d.domain === domain)) {
        showError("This domain is already blocked");
        return;
    }
    
    // Add new domain
    blockedDomains.unshift({
        domain,
        enabled: true,
        dateAdded: new Date().toISOString()
    });
    
    // Save and update UI
    saveBlockedDomains();
    updateBlockedDomainsList();
    
    // Clear input
    domainInput.value = '';
    
    // Show success
    showSuccess(`${domain} has been blocked`);
}

function isValidDomain(domain) {
    // Simple domain validation
    return /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(domain);
}

function updateBlockedDomainsList() {
    blockedDomainsList.innerHTML = '';
    
    if (blockedDomains.length === 0) {
        blockedDomainsList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <p>No domains blocked yet</p>
            </div>
        `;
        return;
    }
    
    blockedDomains.forEach((domainObj, index) => {
        const domainElement = document.createElement('div');
        domainElement.className = 'blocked-domain-item';
        domainElement.innerHTML = `
            <div class="domain-info">
                <label class="toggle-switch">
                    <input type="checkbox" ${domainObj.enabled ? 'checked' : ''} data-index="${index}">
                    <span class="slider"></span>
                </label>
                <span class="domain-name">${domainObj.domain}</span>
                <span class="domain-date">${formatDate(domainObj.dateAdded)}</span>
            </div>
            <div class="domain-actions">
                <button class="icon-button edit-domain" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="icon-button delete-domain" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        blockedDomainsList.appendChild(domainElement);
    });
    
    // Add event listeners to new elements
    document.querySelectorAll('.toggle-switch input').forEach(checkbox => {
        checkbox.addEventListener('change', toggleDomain);
    });
    
    document.querySelectorAll('.edit-domain').forEach(button => {
        button.addEventListener('click', editDomain);
    });
    
    document.querySelectorAll('.delete-domain').forEach(button => {
        button.addEventListener('click', deleteDomain);
    });
}

function toggleDomain(e) {
    const index = e.target.dataset.index;
    blockedDomains[index].enabled = e.target.checked;
    saveBlockedDomains();
    
    const action = e.target.checked ? 'enabled' : 'disabled';
    showSuccess(`${blockedDomains[index].domain} has been ${action}`);
}

function editDomain(e) {
    const index = e.target.closest('button').dataset.index;
    const domainObj = blockedDomains[index];
    
    const newDomain = prompt("Edit domain:", domainObj.domain);
    if (newDomain && newDomain !== domainObj.domain) {
        if (!isValidDomain(newDomain)) {
            showError("Please enter a valid domain");
            return;
        }
        
        if (blockedDomains.some(d => d.domain === newDomain && d !== domainObj)) {
            showError("This domain is already blocked");
            return;
        }
        
        domainObj.domain = newDomain;
        saveBlockedDomains();
        updateBlockedDomainsList();
        showSuccess("Domain updated successfully");
    }
}

function deleteDomain(e) {
    const index = e.target.closest('button').dataset.index;
    const domain = blockedDomains[index].domain;
    
    if (confirm(`Are you sure you want to unblock ${domain}?`)) {
        blockedDomains.splice(index, 1);
        saveBlockedDomains();
        updateBlockedDomainsList();
        showSuccess(`${domain} has been unblocked`);
    }
}

function toggleAllDomains() {
    const currentlyEnabled = blockedDomains.every(d => d.enabled);
    const newState = !currentlyEnabled;
    
    blockedDomains.forEach(d => d.enabled = newState);
    saveBlockedDomains();
    updateBlockedDomainsList();
    
    toggleAllBlocking.querySelector('span').textContent = 
        newState ? 'Disable All' : 'Enable All';
    
    showSuccess(`All domains have been ${newState ? 'enabled' : 'disabled'}`);
}

// Stats and UI
function updateStats() {
    blockedCount.textContent = blockedDomains.length;
    blocksToday.textContent = blockStats.totalBlocksToday;
}

function updateBlockedCount() {
    blockedCount.textContent = blockedDomains.length;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Import/Export
async function importBlocklist() {
    try {
        const fileHandles = await window.showOpenFilePicker({
            types: [{
                description: 'Text Files',
                accept: { 'text/plain': ['.txt'] }
            }],
            multiple: false
        });
        
        const file = await fileHandles[0].getFile();
        const content = await file.text();
        
        const domains = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
            .map(line => line.replace(/^https?:\/\//, '').split('/')[0]);
        
        let addedCount = 0;
        
        for (const domain of domains) {
            if (!isValidDomain(domain)) continue;
            
            if (!blockedDomains.some(d => d.domain === domain)) {
                blockedDomains.push({
                    domain,
                    enabled: true,
                    dateAdded: new Date().toISOString()
                });
                addedCount++;
            }
        }
        
        if (addedCount > 0) {
            saveBlockedDomains();
            updateBlockedDomainsList();
            showSuccess(`Imported ${addedCount} new domains`);
        } else {
            showError("No new domains to import");
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showError("Failed to import blocklist");
        }
    }
}

// Domain suggestions
async function loadDomainSuggestions() {
    // In a real extension, you might get these from browsing history
    const suggestions = [
        'facebook.com',
        'twitter.com',
        'youtube.com',
        'reddit.com',
        'instagram.com'
    ];
    
    domainSuggestions.innerHTML = '';
    
    suggestions.forEach(domain => {
        const pill = document.createElement('span');
        pill.className = 'domain-pill';
        pill.textContent = domain;
        pill.addEventListener('click', () => {
            domainInput.value = domain;
            domainInput.focus();
        });
        
        domainSuggestions.appendChild(pill);
    });
}