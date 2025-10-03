import * as vscode from 'vscode';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private workflowData: any;
    private refreshCallback: (() => Promise<any>) | undefined;

    private constructor(panel: vscode.WebviewPanel, workflowData: any, refreshCallback?: () => Promise<any>) {
        this._panel = panel;
        this.workflowData = workflowData;
        this.refreshCallback = refreshCallback;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        this._panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'refresh' && this.refreshCallback) {
                    try {
                        const newData = await this.refreshCallback();
                        this.updateWorkflow(newData);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Refresh failed: ${error}`);
                    }
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    public static createOrShow(extensionUri: vscode.Uri, workflowData: any, refreshCallback?: () => Promise<any>) {
        const column = vscode.ViewColumn.Two;

        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            PreviewPanel.currentPanel.updateWorkflow(workflowData);
            PreviewPanel.currentPanel.refreshCallback = refreshCallback;
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nPreview',
            'Workflow Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        PreviewPanel.currentPanel = new PreviewPanel(panel, workflowData, refreshCallback);
    }

    public updateWorkflow(workflowData: any) {
        this.workflowData = workflowData;
        this._panel.webview.postMessage({
            command: 'updateWorkflow',
            data: workflowData
        });
    }

    public dispose() {
        PreviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #1e1e1e;
            color: #ccc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        #toolbar {
            background: #2d2d30;
            padding: 12px 16px;
            border-bottom: 1px solid #3e3e42;
        }
        button {
            background: #0e639c;
            color: white;
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 13px;
        }
        button:hover { background: #1177bb; }
        #status { margin-left: 10px; font-size: 13px; color: #888; }
        #content {
            flex: 1;
            overflow: auto;
            padding: 20px;
        }
        h2 {
            color: #4ec9b0;
            margin-bottom: 24px;
            font-size: 24px;
        }
        .workflow-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }
        .node {
            background: linear-gradient(135deg, #2d2d30 0%, #252526 100%);
            border: 2px solid #0e639c;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .node:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(14, 99, 156, 0.3);
        }
        .node-name {
            font-size: 18px;
            font-weight: 600;
            color: #4ec9b0;
            margin-bottom: 12px;
            word-break: break-word;
        }
        .node-type {
            font-size: 14px;
            color: #9cdcfe;
            margin-bottom: 8px;
            font-family: 'Courier New', monospace;
        }
        .node-pos {
            font-size: 12px;
            color: #666;
            margin-top: 8px;
        }
        .connections-section {
            margin-top: 32px;
            padding: 24px;
            background: #252526;
            border-radius: 8px;
            border: 1px solid #3e3e42;
        }
        .connections-title {
            color: #4ec9b0;
            font-size: 20px;
            margin-bottom: 16px;
        }
        .connection {
            padding: 12px 16px;
            margin: 8px 0;
            background: #2d2d30;
            border-left: 4px solid #0e639c;
            border-radius: 4px;
            font-size: 14px;
            display: flex;
            align-items: center;
        }
        .arrow {
            color: #0e639c;
            margin: 0 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button onclick="refresh()">Refresh from n8n</button>
        <span id="status"></span>
    </div>
    <div id="content">
        <h2 id="title"></h2>
        <div class="workflow-grid" id="nodes"></div>
        <div class="connections-section" id="connectionsSection" style="display:none;">
            <div class="connections-title">Connections</div>
            <div id="connections"></div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let workflowData = ${JSON.stringify(this.workflowData)};
        
        function refresh() {
            document.getElementById('status').textContent = 'Refreshing...';
            vscode.postMessage({ command: 'refresh' });
        }

        function render(data) {
            document.getElementById('title').textContent = data.name || 'Untitled Workflow';
            
            const nodesContainer = document.getElementById('nodes');
            nodesContainer.innerHTML = '';
            
            if (data.nodes && data.nodes.length > 0) {
                data.nodes.forEach((node, i) => {
                    const div = document.createElement('div');
                    div.className = 'node';
                    div.innerHTML = 
                        '<div class="node-name">' + (node.name || 'Node ' + i) + '</div>' +
                        '<div class="node-type">' + (node.type || 'unknown').split('.').pop() + '</div>' +
                        '<div class="node-pos">Position: [' + (node.position || [0,0]).join(', ') + ']</div>';
                    nodesContainer.appendChild(div);
                });
            }
            
            const connectionsContainer = document.getElementById('connections');
            const connectionsSection = document.getElementById('connectionsSection');
            
            if (data.connections && Object.keys(data.connections).length > 0) {
                connectionsContainer.innerHTML = '';
                let hasConnections = false;
                
                Object.keys(data.connections).forEach(source => {
                    Object.keys(data.connections[source]).forEach(output => {
                        data.connections[source][output].forEach(conn => {
                            hasConnections = true;
                            const div = document.createElement('div');
                            div.className = 'connection';
                            div.innerHTML = '<span>' + source + '</span><span class="arrow">→</span><span>' + conn.node + '</span>';
                            connectionsContainer.appendChild(div);
                        });
                    });
                });
                
                connectionsSection.style.display = hasConnections ? 'block' : 'none';
            } else {
                connectionsSection.style.display = 'none';
            }
        }

        window.addEventListener('message', e => {
            if (e.data.command === 'updateWorkflow') {
                workflowData = e.data.data;
                render(workflowData);
                document.getElementById('status').textContent = 'Updated';
                setTimeout(() => document.getElementById('status').textContent = '', 2000);
            }
        });

        render(workflowData);
    </script>
</body>
</html>`;
    }
}
