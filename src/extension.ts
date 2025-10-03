import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { N8NApi } from './api/n8nApi';
import { NodesTreeProvider } from './providers/nodesTreeProvider';
import { WorkflowsTreeProvider } from './providers/workflowsTreeProvider';
import { PreviewPanel } from './views/previewPanel';
import { NodeEditorPanel } from './views/nodeEditorPanel';

let currentWorkflowData: any = null;
let currentFilePath: string | undefined = undefined;
let currentWorkflowId: string | undefined = undefined;
let nodesTreeProvider: NodesTreeProvider;
let workflowsTreeProvider: WorkflowsTreeProvider;
let n8nApi: N8NApi;

export function activate(context: vscode.ExtensionContext) {
    n8nApi = new N8NApi();
    
    loadSavedConfig(context).then(() => {
        if (n8nApi.isConfigured()) {
            workflowsTreeProvider.refresh();
        }
    });
    
    nodesTreeProvider = new NodesTreeProvider();
    const nodesTreeView = vscode.window.createTreeView('n8nNodesView', {
        treeDataProvider: nodesTreeProvider
    });
    
    workflowsTreeProvider = new WorkflowsTreeProvider(n8nApi);
    const workflowsTreeView = vscode.window.createTreeView('n8nWorkflowsView', {
        treeDataProvider: workflowsTreeProvider
    });
    
    context.subscriptions.push(nodesTreeView);
    context.subscriptions.push(workflowsTreeView);

    const openWorkflowCommand = vscode.commands.registerCommand('n8n-editor.openWorkflow', async () => {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            openLabel: 'Open Workflow'
        });

        if (fileUri && fileUri[0]) {
            openWorkflowFile(fileUri[0].fsPath);
        }
    });

    const openFromApiCommand = vscode.commands.registerCommand('n8n-editor.openFromApi', async () => {
        if (!n8nApi.isConfigured()) {
            vscode.window.showWarningMessage('Please configure N8N API connection first');
            vscode.commands.executeCommand('n8n-editor.configure');
            return;
        }

        try {
            const workflows = await n8nApi.listWorkflows();
            const items = workflows.map(wf => ({
                label: wf.name,
                description: wf.active ? 'Active' : 'Inactive',
                workflowId: wf.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a workflow to open'
            });

            if (selected) {
                const workflow = await n8nApi.getWorkflow(selected.workflowId);
                currentWorkflowData = workflow;
                currentFilePath = undefined;
                nodesTreeProvider.updateWorkflow(workflow);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: JSON.stringify(workflow, null, 2),
                    language: 'json'
                });
                await vscode.window.showTextDocument(doc);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load workflow: ${error}`);
        }
    });

    const openWorkflowFromTreeCommand = vscode.commands.registerCommand('n8n-editor.openWorkflowFromTree', async (workflowId: string) => {
        try {
            const workflow = await n8nApi.getWorkflow(workflowId);
            currentWorkflowData = workflow;
            currentWorkflowId = workflowId;
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('Please open a workspace folder first');
                return;
            }
            
            const workflowName = workflow.name?.replace(/[^a-z0-9]/gi, '_') || 'workflow';
            const workflowFolder = path.join(workspaceFolder.uri.fsPath, 'n8n-workflows', `${workflowName}_${workflowId}`);
            
            if (fs.existsSync(workflowFolder)) {
                fs.rmSync(workflowFolder, { recursive: true, force: true });
            }
            fs.mkdirSync(workflowFolder, { recursive: true });
            
            const workflowFile = path.join(workflowFolder, 'workflow.json');
            fs.writeFileSync(workflowFile, JSON.stringify(workflow, null, 2));
            currentFilePath = workflowFile;
            
            const nodesFolder = path.join(workflowFolder, 'nodes');
            fs.mkdirSync(nodesFolder, { recursive: true });
            
            workflow.nodes.forEach((node: any, index: number) => {
                const nodeName = node.name?.replace(/[^a-z0-9]/gi, '_') || `node_${index}`;
                const nodeFile = path.join(nodesFolder, `${index}_${nodeName}.json`);
                fs.writeFileSync(nodeFile, JSON.stringify(node, null, 2));
            });
            
            nodesTreeProvider.updateWorkflow(workflow);
            vscode.window.showInformationMessage(`Workflow loaded: ${workflow.name || 'Untitled'}. Select a node to edit.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load workflow: ${error}`);
        }
    });

    const previewCommand = vscode.commands.registerCommand('n8n-editor.preview', () => {
        if (!currentFilePath || !fs.existsSync(currentFilePath)) {
            vscode.window.showErrorMessage('No workflow loaded. Open a workflow first.');
            return;
        }

        try {
            const content = fs.readFileSync(currentFilePath, 'utf8');
            const workflowData = JSON.parse(content);
            
            if (!workflowData.nodes) {
                vscode.window.showErrorMessage('Invalid workflow format.');
                return;
            }

            PreviewPanel.createOrShow(context.extensionUri, workflowData);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load workflow: ${error}`);
        }
    });

    const saveWorkflowCommand = vscode.commands.registerCommand('n8n-editor.saveWorkflow', async () => {
        if (!currentFilePath || !currentWorkflowId) {
            vscode.window.showErrorMessage('No workflow loaded');
            return;
        }

        try {
            const workflowFolder = path.dirname(currentFilePath);
            const nodesFolder = path.join(workflowFolder, 'nodes');
            
            const workflowContent = fs.readFileSync(currentFilePath, 'utf8');
            const workflow = JSON.parse(workflowContent);
            
            const nodeFiles = fs.readdirSync(nodesFolder).filter(f => f.endsWith('.json'));
            const updatedNodes: any[] = [];
            
            nodeFiles.forEach(file => {
                const match = file.match(/^(\d+)_/);
                if (match) {
                    const index = parseInt(match[1]);
                    const nodeContent = fs.readFileSync(path.join(nodesFolder, file), 'utf8');
                    const node = JSON.parse(nodeContent);
                    
                    const jsFile = file.replace('.json', '.js');
                    const jsPath = path.join(nodesFolder, jsFile);
                    if (fs.existsSync(jsPath)) {
                        const jsContent = fs.readFileSync(jsPath, 'utf8');
                        const codeFields = ['jsCode', 'functionCode', 'code', 'javascriptCode'];
                        for (const field of codeFields) {
                            if (node.parameters && field in node.parameters) {
                                node.parameters[field] = jsContent;
                                fs.writeFileSync(path.join(nodesFolder, file), JSON.stringify(node, null, 2));
                                break;
                            }
                        }
                    }
                    
                    updatedNodes[index] = node;
                }
            });
            
            workflow.nodes = updatedNodes.filter(n => n !== undefined);
            
            fs.writeFileSync(currentFilePath, JSON.stringify(workflow, null, 2));
            
            await n8nApi.updateWorkflow(currentWorkflowId, workflow);
            currentWorkflowData = workflow;
            nodesTreeProvider.updateWorkflow(workflow);
            
            vscode.window.showInformationMessage('Workflow saved to n8n');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save: ${error}`);
        }
    });

    const configureCommand = vscode.commands.registerCommand('n8n-editor.configure', async () => {
        const config = n8nApi.getConfig();
        
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter N8N base URL',
            value: config.baseUrl,
            placeHolder: 'https://your-n8n-instance.com'
        });

        if (!baseUrl) {
            return;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter N8N API key',
            value: config.apiKey,
            password: true
        });

        if (!apiKey) {
            return;
        }

        n8nApi.updateConfig(baseUrl, apiKey);
        
        await context.secrets.store('n8n.baseUrl', baseUrl);
        await context.secrets.store('n8n.apiKey', apiKey);

        const isValid = await n8nApi.testConnection();
        if (isValid) {
            vscode.window.showInformationMessage('N8N API configured successfully');
            workflowsTreeProvider.refresh();
        } else {
            vscode.window.showErrorMessage('Failed to connect to N8N API. Please check your configuration');
        }
    });

    const refreshWorkflowsCommand = vscode.commands.registerCommand('n8n-editor.refreshWorkflows', () => {
        workflowsTreeProvider.refresh();
    });

    const selectNodeCommand = vscode.commands.registerCommand('n8n-editor.selectNode', async (index: number) => {
        const node = nodesTreeProvider.getNode(index);
        if (!node) {
            return;
        }

        if (!currentFilePath) {
            vscode.window.showErrorMessage('No workflow loaded');
            return;
        }

        const workflowFolder = path.dirname(currentFilePath);
        const nodesFolder = path.join(workflowFolder, 'nodes');
        const nodeName = node.name?.replace(/[^a-z0-9]/gi, '_') || `node_${index}`;
        const nodeFile = path.join(nodesFolder, `${index}_${nodeName}.json`);

        if (!fs.existsSync(nodeFile)) {
            vscode.window.showErrorMessage('Node file not found');
            return;
        }

        const codeFields = ['jsCode', 'functionCode', 'code', 'javascriptCode'];
        let hasCode = false;
        let codeField = '';
        let codeContent = '';

        for (const field of codeFields) {
            if (node.parameters && node.parameters[field]) {
                hasCode = true;
                codeField = field;
                codeContent = node.parameters[field];
                break;
            }
        }

        if (hasCode) {
            const codeFile = path.join(nodesFolder, `${index}_${nodeName}.js`);
            fs.writeFileSync(codeFile, codeContent);
            
            const readmeFile = path.join(nodesFolder, `${index}_${nodeName}_README.txt`);
            fs.writeFileSync(readmeFile, `Edit the .js file to modify code.
Changes will be saved to ${nodeFile} when you run "N8N: Save Workflow"`);

            const doc = await vscode.workspace.openTextDocument(codeFile);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
            
            const jsonDoc = await vscode.workspace.openTextDocument(nodeFile);
            await vscode.window.showTextDocument(jsonDoc, vscode.ViewColumn.One);
        } else {
            const doc = await vscode.workspace.openTextDocument(nodeFile);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
        }
    });

    vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId === 'json' && doc.uri.scheme === 'file' && doc.fileName.endsWith('.json')) {
            tryLoadWorkflow(doc);
        }
    });

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'json' && activeEditor.document.uri.scheme === 'file') {
        tryLoadWorkflow(activeEditor.document);
    }

    context.subscriptions.push(
        openWorkflowCommand,
        openFromApiCommand,
        openWorkflowFromTreeCommand,
        previewCommand,
        saveWorkflowCommand,
        configureCommand,
        refreshWorkflowsCommand,
        selectNodeCommand
    );
}

function openWorkflowFile(filePath: string) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const workflowData = JSON.parse(content);
        
        if (!workflowData.nodes) {
            vscode.window.showErrorMessage('Invalid workflow format');
            return;
        }

        currentWorkflowData = workflowData;
        currentFilePath = filePath;
        nodesTreeProvider.updateWorkflow(workflowData);
        
        vscode.workspace.openTextDocument(filePath).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open workflow: ${error}`);
    }
}

function tryLoadWorkflow(document: vscode.TextDocument) {
    try {
        const text = document.getText();
        const data = JSON.parse(text);
        
        if (data.nodes && Array.isArray(data.nodes)) {
            currentWorkflowData = data;
            currentFilePath = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
            nodesTreeProvider.updateWorkflow(data);
        }
    } catch (error) {
        
    }
}

export function deactivate() {}

async function loadSavedConfig(context: vscode.ExtensionContext) {
    try {
        const baseUrl = await context.secrets.get('n8n.baseUrl');
        const apiKey = await context.secrets.get('n8n.apiKey');
        
        if (baseUrl && apiKey) {
            n8nApi.updateConfig(baseUrl, apiKey);
        }
    } catch (error) {
        console.error('Failed to load saved config:', error);
    }
}
