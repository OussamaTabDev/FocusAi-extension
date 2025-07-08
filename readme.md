# URL Tracker Extension Setup Instructions

## Overview
This browser extension tracks all URLs you visit and can send them to a Python script for processing or storage.

## Files Structure
```
url-tracker-extension/
├── manifest.json          # Extension configuration
├── background.js          # Background script (main tracking logic)
├── content.js             # Content script (track SPA navigation)
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
└── url_tracker_server.py  # Python server to receive data
```

## Setup Instructions

### 1. Install Python Dependencies
```bash
pip install flask flask-cors
```

### 2. Create Extension Directory
1. Create a new folder called `url-tracker-extension`
2. Save all the JavaScript/HTML files in this folder
3. Make sure the file names match exactly as shown above

### 3. Load Extension in Browser

#### For Chrome/Edge:
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `url-tracker-extension` folder
5. The extension should now appear in your extensions list

#### For Firefox:
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file from your extension folder

### 4. Start Python Server
```bash
python url_tracker_server.py
```

The server will start on `http://localhost:8000`

### 5. Test the Extension
1. Click on the extension icon in your browser toolbar
2. You should see the popup with statistics
3. Click "Test Python Connection" to verify the server is running
4. Browse to different websites - URLs should be tracked automatically

## How It Works

### URL Tracking
- **Background Script**: Monitors tab changes and navigation events
- **Content Script**: Tracks URL changes within single-page applications
- **Automatic**: No user interaction required once installed

### Data Storage
- **Local Storage**: Extension stores data locally in browser
- **Python Server**: Receives data via HTTP POST requests
- **File Storage**: Python script saves to both JSON and CSV files

### Data Format
Each tracked URL includes:
- URL address
- Page title
- Timestamp (when visited)
- Server timestamp (when received by Python)

## Usage

### Extension Popup Features
- **View Statistics**: See total URLs tracked
- **Export Data**: Download URL history as JSON file
- **Test Connection**: Check if Python server is running
- **Clear History**: Remove all stored data
- **Recent URLs**: View last 10 visited URLs

### Python Server Endpoints
- `GET /ping` - Health check
- `POST /track-url` - Receive URL data from extension
- `GET /stats` - Get tracking statistics
- `GET /urls` - Get all tracked URLs (with optional date filtering)
- `GET /export` - Export data (JSON or CSV format)

### Example API Usage
```bash
# Get statistics
curl http://localhost:8000/stats

# Get all URLs
curl http://localhost:8000/urls

# Export as CSV
curl http://localhost:8000/export?format=csv

# Get URLs from specific date range
curl "http://localhost:8000/urls?start_date=2024-01-01&end_date=2024-01-31"
```

## Data Files

### JSON Format (`url_history.json`)
```json
[
  {
    "url": "https://example.com",
    "title": "Example Page",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "server_timestamp": "2024-01-01T12:00:00.123456"
  }
]
```

### CSV Format (`url_history.csv`)
```csv
timestamp,url,title
2024-01-01T12:00:00.000Z,https://example.com,Example Page
```

## Customization

### Modify Tracking Behavior
Edit `background.js` to:
- Filter certain domains
- Add custom data fields
- Change tracking frequency
- Modify storage limits

### Change Server Settings
Edit `url_tracker_server.py` to:
- Change port number
- Add authentication
- Modify data storage format
- Add custom endpoints

### Privacy Considerations
- Extension only tracks URLs you actively visit
- Data is stored locally and on your own server
- No data is sent to external services
- You can clear all data anytime

## Troubleshooting

### Extension Not Working
1. Check browser console for errors
2. Verify all files are in the correct directory
3. Reload the extension in browser settings
4. Check extension permissions

### Python Server Issues
1. Ensure Flask and Flask-CORS are installed
2. Check if port 8000 is available
3. Verify firewall settings
4. Check server logs for errors

### Data Not Saving
1. Verify Python server is running
2. Check network connectivity
3. Look for CORS errors in browser console
4. Ensure file permissions are correct

## Security Notes
- The extension requests minimal permissions
- Data is transmitted over HTTP (use HTTPS in production)
- Consider adding authentication for production use
- Be cautious about sensitive URLs in logs