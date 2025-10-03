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
            currentFilePath = undefined;
            currentWorkflowId = workflowId;
            nodesTreeProvider.updateWorkflow(workflow);
            
            vscode.window.showInformationMessage(`Workflow loaded: ${workflow.name || 'Untitled'}. Select a node to edit or click preview.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load workflow: ${error}`);
        }
    });

    const previewCommand = vscode.commands.registerCommand('n8n-editor.preview', () => {
        if (currentWorkflowData && currentWorkflowData.nodes) {
            PreviewPanel.createOrShow(context.extensionUri, currentWorkflowData);
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No workflow loaded. Open a workflow first.');
            return;
        }

        try {
            const text = editor.document.getText();
            const workflowData = JSON.parse(text);
            
            if (!workflowData.nodes) {
                vscode.window.showErrorMessage('Invalid workflow format. Must contain nodes array.');
                return;
            }

            currentWorkflowData = workflowData;
            nodesTreeProvider.updateWorkflow(workflowData);
            PreviewPanel.createOrShow(context.extensionUri, workflowData);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse workflow: ${error}`);
        }
    });

    const saveWorkflowCommand = vscode.commands.registerCommand('n8n-editor.saveWorkflow', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        try {
            const text = editor.document.getText();
            const workflowData = JSON.parse(text);

            if (currentFilePath) {
                fs.writeFileSync(currentFilePath, JSON.stringify(workflowData, null, 2));
                vscode.window.showInformationMessage('Workflow saved to file');
            } else if (n8nApi.isConfigured() && workflowData.id) {
                await n8nApi.updateWorkflow(workflowData.id, workflowData);
                vscode.window.showInformationMessage('Workflow saved to N8N instance');
                workflowsTreeProvider.refresh();
            } else {
                const saveUri = await vscode.window.showSaveDialog({
                    filters: { 'JSON': ['json'] },
                    defaultUri: vscode.Uri.file(`${workflowData.name || 'workflow'}.json`)
                });

                if (saveUri) {
                    fs.writeFileSync(saveUri.fsPath, JSON.stringify(workflowData, null, 2));
                    currentFilePath = saveUri.fsPath;
                    vscode.window.showInformationMessage('Workflow saved');
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save workflow: ${error}`);
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

        const onSave = async (nodeIndex: number, updatedNode: any) => {
            nodesTreeProvider.updateNode(nodeIndex, updatedNode);
            const updatedWorkflow = nodesTreeProvider.getWorkflowData();
            if (updatedWorkflow) {
                currentWorkflowData = updatedWorkflow;
                
                if (currentWorkflowId) {
                    try {
                        await n8nApi.updateWorkflow(currentWorkflowId, updatedWorkflow);
                        vscode.window.showInformationMessage('Node saved to n8n');
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to save to n8n: ${error}`);
                    }
                } else if (currentFilePath) {
                    try {
                        const fs = require('fs');
                        fs.writeFileSync(currentFilePath, JSON.stringify(updatedWorkflow, null, 2));
                        vscode.window.showInformationMessage('Node saved to file');
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to save to file: ${error}`);
                    }
                }
            }
        };

        NodeEditorPanel.createOrShow(context.extensionUri, index, node, onSave);
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
