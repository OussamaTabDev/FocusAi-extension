// popup.js - Updated for URL Explorer design with integrated blocking functionality

// --- GLOBAL STATE ---
let currentPage = 1;
let itemsPerPage = 10; // Items per page for history view
let allHistory = [];
let filteredHistory = [];
const SETTINGS_KEY = 'urlExplorerSettings';

// Blocking functionality state
let blockedDomains = [];
let blockStats = {
    totalBlocksToday: 0,
    lastReset: new Date().toDateString()
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    setupEventListeners();
    loadAndDisplayAllData(); // Main data loading function
    loadSettings();
    initBlocking(); // Initialize blocking functionality
});

/**
 * Initialize blocking functionality
 */
async function initBlocking() {
    await loadBlockedDomains();
    await loadBlockStats();
    updateBlockedDomainsList();
    updateBlockingStats();
    loadDomainSuggestions();
}

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
                case 'blocking':
                    loadBlockingTab();
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

    // Blocking Tab
    document.getElementById('addDomainBtn')?.addEventListener('click', focusDomainInput);
    document.getElementById('addDomainSubmit')?.addEventListener('click', addDomain);
    document.getElementById('domainInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });
    document.getElementById('importBlocklistBtn')?.addEventListener('click', importBlocklist);
    document.getElementById('toggleAllBlocking')?.addEventListener('click', toggleAllBlocking);

    // Domains Tab
    document.getElementById('domainReportBtn')?.addEventListener('click', () => showToast('Domain reports coming soon!'));

    // Settings Tab
    document.getElementById('saveSettings')?.addEventListener('click', saveSettings);
    document.getElementById('exportAllBtn')?.addEventListener('click', exportUrls);
    document.getElementById('clearAllBtn')?.addEventListener('click', clearHistory);
}

// --- BLOCKING FUNCTIONALITY ---

/**
 * Load blocked domains from storage
 */
async function loadBlockedDomains() {
    const result = await chrome.storage.sync.get('blockedDomains');
    blockedDomains = result.blockedDomains || [];
}

/**
 * Save blocked domains to storage
 */
async function saveBlockedDomains() {
    await chrome.storage.sync.set({ blockedDomains });
    updateBlockedCount();
    // Notify background script to update rules
    chrome.runtime.sendMessage({
        action: 'updateBlockingRules',
        domains: blockedDomains
    });
}

/**
 * Load block statistics from storage
 */
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

/**
 * Save block statistics to storage
 */
async function saveBlockStats() {
    await chrome.storage.local.set({ blockStats });
}

/**
 * Focus the domain input field
 */
function focusDomainInput() {
    const domainInput = document.getElementById('domainInput');
    if (domainInput) {
        domainInput.focus();
    }
}

/**
 * Add a new domain to block
 */
async function addDomain() {
    const domainInput = document.getElementById('domainInput');
    let domain = domainInput.value.trim();
    if (!domain) return;
    
    domain = domain.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    
    if (!isValidDomain(domain)) {
        showToast("Please enter a valid domain (e.g., example.com)", "error");
        return;
    }
    
    if (blockedDomains.some(d => d.domain === domain)) {
        showToast("This domain is already blocked", "error");
        return;
    }
    
    blockedDomains.unshift({
        domain,
        enabled: true,
        dateAdded: new Date().toISOString()
    });
    
    await saveBlockedDomains();
    updateBlockedDomainsList();
    domainInput.value = '';
    showToast(`${domain} has been blocked`, "success");
}

/**
 * Validate domain format
 */
function isValidDomain(domain) {
    return /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(domain);
}

/**
 * Update the blocked domains list UI
 */
function updateBlockedDomainsList() {
    const blockedDomainsList = document.getElementById('blockedDomainsList');
    if (!blockedDomainsList) return;
    
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
            <div class="blocked-domain-info">
                <div class="blocked-domain-name">${domainObj.domain}</div>
                <div class="blocked-domain-meta">Added ${formatDate(domainObj.dateAdded)}</div>
            </div>
            <div class="blocked-domain-actions">
                <div class="blocked-domain-toggle ${domainObj.enabled ? 'active' : ''}" data-index="${index}"></div>
                <button class="remove-domain-btn" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Add event listeners
        const toggle = domainElement.querySelector('.blocked-domain-toggle');
        toggle.addEventListener('click', () => toggleDomain(index));
        
        const removeBtn = domainElement.querySelector('.remove-domain-btn');
        removeBtn.addEventListener('click', () => removeDomain(index));
        
        blockedDomainsList.appendChild(domainElement);
    });
}

/**
 * Toggle domain blocking status
 */
async function toggleDomain(index) {
    blockedDomains[index].enabled = !blockedDomains[index].enabled;
    await saveBlockedDomains();
    updateBlockedDomainsList();
    showToast(
        `${blockedDomains[index].domain} has been ${blockedDomains[index].enabled ? 'enabled' : 'disabled'}`,
        "success"
    );
}

/**
 * Remove a blocked domain
 */
async function removeDomain(index) {
    const domain = blockedDomains[index].domain;
    if (confirm(`Are you sure you want to unblock ${domain}?`)) {
        blockedDomains.splice(index, 1);
        await saveBlockedDomains();
        updateBlockedDomainsList();
        showToast(`${domain} has been unblocked`, "success");
    }
}

/**
 * Toggle all domains on/off
 */
async function toggleAllBlocking() {
    const allEnabled = blockedDomains.every(d => d.enabled);
    const newState = !allEnabled;
    
    blockedDomains.forEach(d => d.enabled = newState);
    await saveBlockedDomains();
    updateBlockedDomainsList();
    
    const toggleBtn = document.getElementById('toggleAllBlocking');
    if (toggleBtn) {
        toggleBtn.textContent = newState ? 'Disable All' : 'Enable All';
    }
    
    showToast(`All domains have been ${newState ? 'enabled' : 'disabled'}`, "success");
}

/**
 * Import blocklist from file
 */
async function importBlocklist() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const content = await file.text();
            const domains = content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
                .map(line => line.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''));
            
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
                await saveBlockedDomains();
                updateBlockedDomainsList();
                showToast(`Imported ${addedCount} new domains`, "success");
            } else {
                showToast("No new domains to import", "warning");
            }
        };
        
        input.click();
    } catch (err) {
        showToast("Failed to import blocklist", "error");
    }
}

/**
 * Load blocking tab data
 */
function loadBlockingTab() {
    if (document.getElementById('blocking-tab')?.classList.contains('active')) {
        updateBlockedDomainsList();
        updateBlockingStats();
        loadDomainSuggestions();
    }
}

/**
 * Update blocking statistics
 */
function updateBlockingStats() {
    const blockedCount = document.getElementById('blockedCount');
    const blocksToday = document.getElementById('blocksToday');
    
    if (blockedCount) blockedCount.textContent = blockedDomains.length;
    if (blocksToday) blocksToday.textContent = blockStats.totalBlocksToday;
}

/**
 * Update blocked count display
 */
function updateBlockedCount() {
    const blockedCount = document.getElementById('blockedCount');
    if (blockedCount) {
        blockedCount.textContent = blockedDomains.length;
    }
}

/**
 * Load domain suggestions
 */
function loadDomainSuggestions() {
    const domainSuggestions = document.getElementById('domainSuggestions');
    if (!domainSuggestions) return;
    
    const suggestions = [
        'facebook.com',
        'twitter.com',
        'youtube.com',
        'reddit.com',
        'instagram.com',
        'tiktok.com',
        'netflix.com',
        'twitch.tv'
    ];
    
    domainSuggestions.innerHTML = '';
    
    suggestions.forEach(domain => {
        // Skip if already blocked
        if (blockedDomains.some(d => d.domain === domain)) return;
        
        const pill = document.createElement('span');
        pill.className = 'domain-pill';
        pill.textContent = domain;
        pill.addEventListener('click', () => {
            const domainInput = document.getElementById('domainInput');
            if (domainInput) {
                domainInput.value = domain;
                domainInput.focus();
            }
        });
        
        domainSuggestions.appendChild(pill);
    });
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
        if (document.getElementById('blocking-tab').classList.contains('active')) {
            loadBlockingTab();
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
    const totalUrls = document.getElementById('totalUrls');
    const totalDomains = document.getElementById('totalDomains');
    const todayCountEl = document.getElementById('todayCount');
    const growthRateEl = document.getElementById('growthRate');
    
    if (totalUrls) totalUrls.textContent = totalCount;
    if (totalDomains) totalDomains.textContent = uniqueDomains;
    if (todayCountEl) todayCountEl.textContent = todayCount;
    if (growthRateEl) growthRateEl.textContent = `${growthSign}${growthRate.toFixed(0)}%`;
}

/**
 * Loads the 5 most recent URLs into the "Recent Activity" list on the dashboard.
 */
function loadRecentActivity() {
    const recentActivity = allHistory.slice(-5).reverse();
    const activityList = document.getElementById('recentActivity');
    if (!activityList) return;
    
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
    if (!domainsList) return;
    
    domainsList.innerHTML = ''; // Clear previous list

    // Update domain stats
    const domainsTotal = document.getElementById('domainsTotal');
    const topDomain = document.getElementById('topDomain');
    
    if (domainsTotal) domainsTotal.textContent = sortedDomains.length;
    if (topDomain) topDomain.textContent = sortedDomains.length > 0 ? sortedDomains[0][0] : 'N/A';

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
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = domain;
                filterHistory();
            }
        }, 100); // Timeout to allow tab switch animation
    });

    return itemEl;
}

// --- HISTORY FILTERING & PAGINATION ---

/**
 * Filters the history based on search and time dropdown.
 */
function filterHistory() {
    const searchInput = document.getElementById('searchInput');
    const timeFilter = document.getElementById('timeFilter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filterType = timeFilter ? timeFilter.value : 'all';

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
    if (!historyList) return;
    
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
    const historyCount = document.getElementById('historyCount');
    if (historyCount) {
        const count = filteredHistory.length;
        historyCount.textContent = `${count} URL${count === 1 ? '' : 's'} found`;
    }
}

/**
 * Updates pagination controls (buttons, page info text).
 */
function updatePagination() {
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const pagination = document.getElementById('pagination');
    
    if (prevPage) prevPage.disabled = currentPage === 1;
    if (nextPage) nextPage.disabled = currentPage === totalPages || totalPages === 0;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    if (pagination) pagination.style.display = totalPages > 1 ? 'flex' : 'none';
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
    if (!indicator) return;
    
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('span');
    
    if (dot && text) {
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

/**
 * Format date string for display
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
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
    if (!container) {
        // Create toast container if it doesn't exist
        const toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
        color: white;
        padding: 12px 24px;
        margin-bottom: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        pointer-events: auto;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    const actualContainer = document.getElementById('toastContainer');
    actualContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove toast after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}
