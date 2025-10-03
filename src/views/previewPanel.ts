import * as vscode from 'vscode';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private workflowData: any;

    private constructor(panel: vscode.WebviewPanel, workflowData: any) {
        this._panel = panel;
        this.workflowData = workflowData;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    public static createOrShow(extensionUri: vscode.Uri, workflowData: any) {
        const column = vscode.ViewColumn.Two;

        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            PreviewPanel.currentPanel.updateWorkflow(workflowData);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nPreview',
            'N8N Workflow Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        PreviewPanel.currentPanel = new PreviewPanel(panel, workflowData);
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
        const workflowJson = JSON.stringify(this.workflowData || {});
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>N8N Workflow Preview</title>
    <script src="https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.0.0/webcomponents-loader.js"></script>
    <script src="https://www.unpkg.com/lit@2.0.0-rc.2/polyfill-support.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@n8n_io/n8n-demo-component/n8n-demo.bundled.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #1e1e1e;
            color: #cccccc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            overflow: hidden;
            height: 100vh;
        }
        #loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-size: 16px;
            color: #888;
        }
        #container {
            width: 100%;
            height: 100vh;
            display: none;
        }
        #container.loaded {
            display: block;
        }
        n8n-demo {
            --n8n-workflow-min-height: 100vh;
            width: 100%;
            height: 100%;
            display: block;
        }
    </style>
</head>
<body>
    <div id="loading">Loading preview...</div>
    <div id="container">
        <n8n-demo id="n8nDemo" theme="dark" disableinteractivity="false"></n8n-demo>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let workflowData = ${workflowJson};

        function updateWorkflow(data) {
            workflowData = data;
            const demoElement = document.getElementById('n8nDemo');
            if (demoElement) {
                demoElement.setAttribute('workflow', JSON.stringify(data));
            }
        }

        function initPreview() {
            const container = document.getElementById('container');
            const loading = document.getElementById('loading');
            const demoElement = document.getElementById('n8nDemo');
            
            if (demoElement && workflowData && Object.keys(workflowData).length > 0) {
                console.log('Setting workflow:', workflowData);
                demoElement.setAttribute('workflow', JSON.stringify(workflowData));
                loading.style.display = 'none';
                container.classList.add('loaded');
            } else {
                loading.textContent = 'No workflow data available';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateWorkflow') {
                updateWorkflow(message.data);
            }
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initPreview, 1000);
            });
        } else {
            setTimeout(initPreview, 1000);
        }
    </script>
</body>
</html>`;
    }
}
