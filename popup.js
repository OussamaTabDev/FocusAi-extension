// Popup script with enhanced history display
let currentPage = 1;
let itemsPerPage = 10;
let allHistory = [];
let filteredHistory = [];

document.addEventListener('DOMContentLoaded', function() {
  initializeTabs();
  loadAllData();
  setupEventListeners();
  testPythonConnection();
});

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // Load data for the active tab
      if (tabName === 'history') {
        loadHistoryTab();
      } else if (tabName === 'domains') {
        loadDomainsTab();
      }
    });
  });
}

function setupEventListeners() {
  // Stats tab buttons
  document.getElementById('exportBtn').addEventListener('click', exportUrls);
  document.getElementById('testPythonBtn').addEventListener('click', testPythonConnection);
  document.getElementById('clearBtn').addEventListener('click', clearHistory);
  
  // History tab controls
  document.getElementById('searchInput').addEventListener('input', filterHistory);
  document.getElementById('filterSelect').addEventListener('change', filterHistory);
  document.getElementById('refreshBtn').addEventListener('click', loadHistoryTab);
  
  // Pagination
  document.getElementById('prevBtn').addEventListener('click', () => changePage(-1));
  document.getElementById('nextBtn').addEventListener('click', () => changePage(1));
}

function loadAllData() {
  chrome.storage.local.get(['urlHistory'], (result) => {
    allHistory = result.urlHistory || [];
    filteredHistory = [...allHistory];
    updateStats();
    loadRecentUrls();
  });
}

function updateStats() {
  const totalCount = allHistory.length;
  const uniqueDomains = new Set(allHistory.map(item => extractDomain(item.url))).size;
  
  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('uniqueDomains').textContent = uniqueDomains;
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return 'unknown';
  }
}

function loadRecentUrls() {
  const recentUrls = allHistory.slice(-5).reverse();
  const recentUrlList = document.getElementById('recentUrlList');
  
  if (recentUrls.length === 0) {
    recentUrlList.innerHTML = '<div class="no-data">No URLs tracked yet</div>';
    return;
  }
  
  recentUrlList.innerHTML = '';
  recentUrls.forEach(urlData => {
    const urlItem = createUrlItem(urlData);
    recentUrlList.appendChild(urlItem);
  });
}

function loadHistoryTab() {
  if (document.getElementById('history-tab').classList.contains('active')) {
    filterHistory();
  }
}

function filterHistory() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterType = document.getElementById('filterSelect').value;
  
  let filtered = [...allHistory];
  
  // Apply date filter
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
    
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= cutoffDate;
    });
  }
  
  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(item => 
      item.url.toLowerCase().includes(searchTerm) ||
      item.title.toLowerCase().includes(searchTerm) ||
      extractDomain(item.url).toLowerCase().includes(searchTerm)
    );
  }
  
  // Sort by timestamp (newest first)
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  filteredHistory = filtered;
  currentPage = 1;
  displayHistory();
  updateHistoryStats();
}

function displayHistory() {
  const historyList = document.getElementById('historyList');
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = filteredHistory.slice(startIndex, endIndex);
  
  if (pageItems.length === 0) {
    historyList.innerHTML = '<div class="no-data">No URLs found</div>';
    updatePagination();
    return;
  }
  
  historyList.innerHTML = '';
  pageItems.forEach(urlData => {
    const urlItem = createUrlItem(urlData, true);
    historyList.appendChild(urlItem);
  });
  
  updatePagination();
}

function createUrlItem(urlData, showDomain = false) {
  const urlItem = document.createElement('div');
  urlItem.className = 'url-item';
  
  const domain = extractDomain(urlData.url);
  const timeStr = new Date(urlData.timestamp).toLocaleString();
  
  urlItem.innerHTML = `
    <div class="url-title">${urlData.title || 'No Title'}</div>
    <div class="url-address">${urlData.url}</div>
    <div class="url-meta">
      ${showDomain ? `<span class="url-domain">${domain}</span>` : ''}
      <span class="url-time">${timeStr}</span>
    </div>
  `;
  
  // Add click handler to open URL
  urlItem.addEventListener('click', () => {
    chrome.tabs.create({ url: urlData.url });
  });
  
  return urlItem;
}

function updateHistoryStats() {
  const filterType = document.getElementById('filterSelect').value;
  const filterLabels = {
    'all': 'All Time',
    'today': 'Today',
    'week': 'This Week',
    'month': 'This Month'
  };
  
  document.getElementById('historyCount').textContent = `${filteredHistory.length} URLs`;
  document.getElementById('historyRange').textContent = filterLabels[filterType];
}

function updatePagination() {
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');
  
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
  pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
}

function changePage(direction) {
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const newPage = currentPage + direction;
  
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    displayHistory();
  }
}

function loadDomainsTab() {
  if (!document.getElementById('domains-tab').classList.contains('active')) {
    return;
  }
  
  const domainCounts = {};
  
  allHistory.forEach(item => {
    const domain = extractDomain(item.url);
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });
  
  const sortedDomains = Object.entries(domainCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20);
  
  const domainList = document.getElementById('domainList');
  
  if (sortedDomains.length === 0) {
    domainList.innerHTML = '<div class="no-data">No domains to display</div>';
    return;
  }
  
  domainList.innerHTML = '';
  sortedDomains.forEach(([domain, count]) => {
    const domainItem = document.createElement('div');
    domainItem.className = 'domain-item';
    domainItem.innerHTML = `
      <span class="domain-name">${domain}</span>
      <span class="domain-count">${count}</span>
    `;
    
    // Add click handler to filter history by domain
    domainItem.addEventListener('click', () => {
      // Switch to history tab
      document.querySelector('[data-tab="history"]').click();
      
      // Set search to domain
      setTimeout(() => {
        document.getElementById('searchInput').value = domain;
        filterHistory();
      }, 100);
    });
    
    domainList.appendChild(domainItem);
  });
}

function exportUrls() {
  const dataStr = JSON.stringify(allHistory, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `url_history_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function testPythonConnection() {
  const statusElement = document.getElementById('pythonStatus');
  statusElement.textContent = 'Testing...';
  
  fetch('http://localhost:8000/ping')
    .then(response => response.json())
    .then(data => {
      statusElement.textContent = 'Connected ✓';
      statusElement.style.color = 'green';
    })
    .catch(error => {
      statusElement.textContent = 'Disconnected ✗';
      statusElement.style.color = 'red';
    });
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all URL history?')) {
    chrome.storage.local.clear(() => {
      allHistory = [];
      filteredHistory = [];
      updateStats();
      loadRecentUrls();
      displayHistory();
      alert('History cleared!');
    });
  }
}