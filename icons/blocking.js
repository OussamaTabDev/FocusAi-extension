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
function setupWebRequestListener() {
    if (!chrome.webRequest) {
        console.warn("webRequest API not available");
        return;
    }
    
    chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            const url = new URL(details.url);
            const domain = url.hostname;
            
            // Check if domain is blocked and enabled
            const blockedDomain = blockedDomains.find(d => 
                isDomainMatch(domain, d.domain) && d.enabled
            );
            
            if (blockedDomain) {
                // Update stats
                blockStats.totalBlocksToday++;
                updateStats();
                saveBlockStats();
                
                // Show block notification
                showBlockNotification(domain);
                
                return { cancel: true };
            }
            
            return { cancel: false };
        },
        { urls: ["<all_urls>"] },
        ["blocking"]
    );
}

function isDomainMatch(requestDomain, blockedDomain) {
    // Exact match
    if (requestDomain === blockedDomain) return true;
    
    // Subdomain match (e.g., www.example.com matches example.com)
    if (requestDomain.endsWith('.' + blockedDomain)) return true;
    
    return false;
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