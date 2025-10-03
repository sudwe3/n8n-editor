import * as vscode from 'vscode';

interface N8NNode {
    name: string;
    type: string;
    parameters: any;
    position: number[];
    typeVersion?: number;
    credentials?: any;
}

interface NodeItem {
    id: string;
    name: string;
    type: string;
    category: string;
    data: N8NNode;
    nodeIndex: number;
}

type TreeItem = CategoryItem | NodeTreeItem;

interface CategoryItem {
    type: 'category';
    category: string;
    nodes: NodeItem[];
}

interface NodeTreeItem {
    type: 'node';
    item: NodeItem;
}

export class NodesTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private groupedNodes: { [category: string]: NodeItem[] } = {};
    private workflowData: any = null;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public updateWorkflow(workflowData: any) {
        this.workflowData = workflowData;
        this.groupedNodes = this.parseWorkflow(workflowData);
        this.refresh();
    }

    private parseWorkflow(wf: any): { [category: string]: NodeItem[] } {
        if (!wf || !wf.nodes || !Array.isArray(wf.nodes)) {
            return {};
        }

        const grouped: { [category: string]: NodeItem[] } = {};

        wf.nodes.forEach((node: N8NNode, idx: number) => {
            if (!node) {
                return;
            }

            const nodeType = node.type || 'Unknown';
            const category = nodeType.split('.').pop() || 'Other';

            if (!grouped[category]) {
                grouped[category] = [];
            }

            grouped[category].push({
                id: `node-${idx}`,
                name: node.name || `Node ${idx}`,
                type: nodeType,
                category: category,
                data: node,
                nodeIndex: idx
            });
        });

        return grouped;
    }

    public getNode(index: number): N8NNode | undefined {
        if (!this.workflowData || !this.workflowData.nodes) {
            return undefined;
        }
        return this.workflowData.nodes[index];
    }

    public getWorkflowData(): any {
        return this.workflowData;
    }

    public updateNode(index: number, node: N8NNode) {
        if (this.workflowData && this.workflowData.nodes && index >= 0 && index < this.workflowData.nodes.length) {
            this.workflowData.nodes[index] = node;
            this.groupedNodes = this.parseWorkflow(this.workflowData);
            this.refresh();
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        if (element.type === 'category') {
            const treeItem = new vscode.TreeItem(
                element.category,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            treeItem.description = `${element.nodes.length} nodes`;
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'category';
            return treeItem;
        } else {
            const nodeItem = element.item;
            const treeItem = new vscode.TreeItem(
                nodeItem.name,
                vscode.TreeItemCollapsibleState.None
            );
            
            treeItem.description = nodeItem.category;
            treeItem.tooltip = `Type: ${nodeItem.type}`;
            
            treeItem.command = {
                command: 'n8n-editor.selectNode',
                title: 'Select Node',
                arguments: [nodeItem.nodeIndex]
            };

            const iconMap: { [key: string]: string } = {
                'start': 'play',
                'httpRequest': 'cloud-download',
                'code': 'code',
                'set': 'symbol-field',
                'if': 'git-branch',
                'merge': 'merge',
                'function': 'symbol-method',
                'webhook': 'server',
            };

            const iconName = iconMap[nodeItem.category] || 'circle-outline';
            treeItem.iconPath = new vscode.ThemeIcon(iconName);

            return treeItem;
        }
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            const categories = Object.keys(this.groupedNodes).sort();
            const items: TreeItem[] = categories.map(category => ({
                type: 'category' as const,
                category: category,
                nodes: this.groupedNodes[category]
            }));
            return Promise.resolve(items);
        }

        if (element.type === 'category') {
            const items: TreeItem[] = element.nodes.map(nodeItem => ({
                type: 'node' as const,
                item: nodeItem
            }));
            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }
}
