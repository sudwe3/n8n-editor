# N8N Workflow Editor for VSCode

VSCode extension for editing N8N workflows with tree view, syntax highlighting, and dedicated JavaScript code editor.

## Features

- **Tree View**: Browse workflow nodes organized by category
- **Syntax Highlighting**: JSON and JavaScript syntax highlighting with Monaco Editor
- **Code Editor**: Dedicated tab for JavaScript code in code nodes
- **Visual Preview**: Preview workflows using n8n web component
- **Live API Integration**: Connect to your n8n instance and edit workflows in real-time
- **Auto-Save**: Changes automatically sync to n8n

## Installation

### Option 1: Install from Release

1. Download the latest `.vsix` file from [Releases](https://github.com/sudwe3/n8n-editor/releases)
2. Open VSCode
3. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
4. Click "..." menu > Install from VSIX
5. Select the downloaded file

### Option 2: Build from Source

```bash
git clone https://github.com/sudwe3/n8n-editor.git
cd n8n-editor
npm install
npm run package
```

This creates `n8n-editor-0.0.1.vsix` in the root directory. Install it using the steps above.

## Usage

### 1. Configure N8N Connection

- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Search "N8N: Configure API Connection"
- Enter your n8n base URL (e.g., `https://your-n8n.com`)
- Enter your n8n API key
- Credentials are stored securely and persist across sessions

### 2. Edit Workflows

- Open "N8N Workflows" view in sidebar
- Click a workflow to load it
- Click any node in the tree to edit
- For code nodes, switch to "Code" tab for JavaScript editing
- Changes save automatically to n8n or press `Ctrl+S` / `Cmd+S`

### 3. Preview Workflows

Click the eye icon in the toolbar to preview the workflow visually.

## Requirements

- VSCode 1.104.0 or higher
- Access to an n8n instance with API enabled
- Works on Windows, Mac, and Linux

## Getting N8N API Key

1. Go to your n8n instance
2. Settings > n8n API
3. Create an API key
4. Copy and use in the extension

## Commands

- `N8N: Configure API Connection`: Set up n8n API credentials
- `N8N: Open Workflow from File`: Open a local workflow JSON file
- `N8N: Open from Instance`: Select and open a workflow from n8n
- `N8N: Preview Workflow`: Show visual preview of current workflow
- `N8N: Refresh Workflows`: Reload workflow list from n8n

## Development

```bash
npm install
npm run watch
```

Press F5 to open Extension Development Host.

## License

MIT

## Contributing

Issues and pull requests welcome.
