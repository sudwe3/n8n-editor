import * as vscode from 'vscode';

interface NodeEditorMessage {
    command: 'save' | 'switchTab';
    content?: string;
    tab?: string;
}

export class NodeEditorPanel {
    public static currentPanels: Map<number, NodeEditorPanel> = new Map();
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private nodeIndex: number;
    private node: any;
    private onSaveCallback: (index: number, updatedNode: any) => Promise<void> | void;
    private codeField: { code: string; field: string } | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        nodeIndex: number,
        node: any,
        onSave: (index: number, updatedNode: any) => Promise<void> | void
    ) {
        this._panel = panel;
        this.nodeIndex = nodeIndex;
        this.node = node;
        this.onSaveCallback = onSave;
        this.codeField = this.extractCode(node);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (message: NodeEditorMessage) => {
                switch (message.command) {
                    case 'save':
                        if (message.content) {
                            this.handleSave(message.content, message.tab || 'json');
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private extractCode(node: any): { code: string; field: string } | null {
        const codeFields = ['jsCode', 'functionCode', 'code', 'javascriptCode'];
        for (const field of codeFields) {
            if (node.parameters && node.parameters[field]) {
                return { code: node.parameters[field], field };
            }
        }
        return null;
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        nodeIndex: number,
        node: any,
        onSave: (index: number, updatedNode: any) => Promise<void> | void
    ) {
        const existing = NodeEditorPanel.currentPanels.get(nodeIndex);
        if (existing) {
            existing._panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nNodeEditor',
            `Edit: ${node.name}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const nodeEditor = new NodeEditorPanel(panel, nodeIndex, node, onSave);
        NodeEditorPanel.currentPanels.set(nodeIndex, nodeEditor);
    }

    private async handleSave(content: string, tab: string) {
        try {
            if (tab === 'code' && this.codeField) {
                const updatedNode = JSON.parse(JSON.stringify(this.node));
                updatedNode.parameters[this.codeField.field] = content;
                this.node = updatedNode;
                await this.onSaveCallback(this.nodeIndex, updatedNode);
            } else {
                const updatedNode = JSON.parse(content);
                this.node = updatedNode;
                this.codeField = this.extractCode(updatedNode);
                await this.onSaveCallback(this.nodeIndex, updatedNode);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Invalid content: ${error}`);
        }
    }

    public dispose() {
        NodeEditorPanel.currentPanels.delete(this.nodeIndex);
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nodeJson = JSON.stringify(this.node, null, 2);
        const hasCode = this.codeField !== null;
        const codeContent = hasCode ? this.codeField!.code : '';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Node</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/editor/editor.main.min.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: #1e1e1e;
            color: #cccccc;
        }
        #container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        #tabs {
            background-color: #2d2d30;
            display: flex;
            border-bottom: 1px solid #3e3e42;
        }
        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #969696;
            font-size: 13px;
            border-bottom: 2px solid transparent;
        }
        .tab:hover {
            color: #cccccc;
        }
        .tab.active {
            color: #ffffff;
            border-bottom: 2px solid #007acc;
        }
        #editor {
            flex: 1;
        }
        .editor-content {
            width: 100%;
            height: 100%;
            display: none;
        }
        .editor-content.active {
            display: block;
        }
        #info {
            background-color: #2d2d30;
            padding: 6px 16px;
            font-size: 12px;
            color: #969696;
            border-top: 1px solid #3e3e42;
        }
    </style>
</head>
<body>
    <div id="container">
        ${hasCode ? `
        <div id="tabs">
            <button class="tab active" onclick="switchTab('json')">JSON</button>
            <button class="tab" onclick="switchTab('code')">Code</button>
        </div>
        ` : ''}
        <div id="editor">
            <div id="jsonEditor" class="editor-content active"></div>
            ${hasCode ? '<div id="codeEditor" class="editor-content"></div>' : ''}
        </div>
        <div id="info">
            Auto-saves on panel close • Press Cmd/Ctrl+S to save manually
        </div>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();
        let jsonEditor, codeEditor;
        let currentTab = 'json';
        const hasCode = ${hasCode};
        
        require.config({ 
            paths: { 
                vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' 
            }
        });
        
        require(['vs/editor/editor.main'], function() {
            jsonEditor = monaco.editor.create(document.getElementById('jsonEditor'), {
                value: ${JSON.stringify(nodeJson)},
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                tabSize: 2
            });
            
            if (hasCode) {
                codeEditor = monaco.editor.create(document.getElementById('codeEditor'), {
                    value: ${JSON.stringify(codeContent)},
                    language: 'javascript',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    tabSize: 2
                });
                
                codeEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
            }
            
            jsonEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
        });
        
        function switchTab(tab) {
            currentTab = tab;
            
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
            });
            document.querySelectorAll('.editor-content').forEach(e => {
                e.classList.remove('active');
            });
            
            if (tab === 'json') {
                document.querySelector('.tab:nth-child(1)').classList.add('active');
                document.getElementById('jsonEditor').classList.add('active');
            } else {
                document.querySelector('.tab:nth-child(2)').classList.add('active');
                document.getElementById('codeEditor').classList.add('active');
            }
        }
        
        function save() {
            const editor = currentTab === 'json' ? jsonEditor : codeEditor;
            if (editor) {
                const content = editor.getValue();
                
                if (currentTab === 'json') {
                    try {
                        JSON.parse(content);
                    } catch (error) {
                        alert('Invalid JSON: ' + error.message);
                        return;
                    }
                }
                
                vscode.postMessage({
                    command: 'save',
                    content: content,
                    tab: currentTab
                });
            }
        }
        
        window.addEventListener('beforeunload', () => {
            save();
        });
    </script>
</body>
</html>`;
    }
}
