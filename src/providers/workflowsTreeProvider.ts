import * as vscode from 'vscode';
import { N8NApi, N8NWorkflowListItem } from '../api/n8nApi';

export class WorkflowsTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorkflowTreeItem | undefined | null | void> = new vscode.EventEmitter<WorkflowTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WorkflowTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private workflows: N8NWorkflowListItem[] = [];

    constructor(private api: N8NApi) {}

    refresh(): void {
        this.loadWorkflows();
    }

    private async loadWorkflows() {
        try {
            if (!this.api.isConfigured()) {
                this.workflows = [];
                this._onDidChangeTreeData.fire();
                return;
            }

            this.workflows = await this.api.listWorkflows();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load workflows: ${error}`);
            this.workflows = [];
            this._onDidChangeTreeData.fire();
        }
    }

    getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkflowTreeItem): Thenable<WorkflowTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        if (!this.api.isConfigured()) {
            return Promise.resolve([]);
        }

        const items = this.workflows.map(wf => new WorkflowTreeItem(
            wf.name,
            wf.id,
            wf.active,
            vscode.TreeItemCollapsibleState.None
        ));

        return Promise.resolve(items);
    }
}

class WorkflowTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly workflowId: string,
        public readonly active: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label} (${active ? 'Active' : 'Inactive'})`;
        this.description = active ? 'Active' : 'Inactive';
        this.iconPath = new vscode.ThemeIcon(active ? 'check' : 'circle-outline');
        
        this.command = {
            command: 'n8n-editor.openWorkflowFromTree',
            title: 'Open Workflow',
            arguments: [this.workflowId]
        };
    }
}
