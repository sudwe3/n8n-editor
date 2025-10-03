import * as vscode from 'vscode';

export interface N8NWorkflow {
    id: string;
    name: string;
    active: boolean;
    nodes: any[];
    connections: any;
    settings?: any;
    staticData?: any;
    tags?: any[];
    versionId?: string;
}

export interface N8NWorkflowListItem {
    id: string;
    name: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export class N8NApi {
    private baseUrl: string = '';
    private apiKey: string = '';

    constructor() {
        this.loadConfig();
    }

    private loadConfig() {
        const config = vscode.workspace.getConfiguration('n8n');
        this.baseUrl = config.get<string>('apiUrl', '');
        this.apiKey = config.get<string>('apiKey', '');
    }

    public updateConfig(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        const config = vscode.workspace.getConfiguration('n8n');
        config.update('apiUrl', baseUrl, vscode.ConfigurationTarget.Global);
        config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    }

    public isConfigured(): boolean {
        return this.baseUrl !== '' && this.apiKey !== '';
    }

    public getConfig() {
        return {
            baseUrl: this.baseUrl,
            apiKey: this.apiKey
        };
    }

    private async request<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
        if (!this.isConfigured()) {
            throw new Error('N8N API not configured');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers: Record<string, string> = {
            'X-N8N-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json() as T;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`N8N API Error: ${error.message}`);
            }
            throw error;
        }
    }

    public async listWorkflows(): Promise<N8NWorkflowListItem[]> {
        const response = await this.request<{ data: N8NWorkflowListItem[] }>('/api/v1/workflows');
        return response.data;
    }

    public async getWorkflow(id: string): Promise<N8NWorkflow> {
        return await this.request<N8NWorkflow>(`/api/v1/workflows/${id}`);
    }

    public async createWorkflow(workflow: Partial<N8NWorkflow>): Promise<N8NWorkflow> {
        return await this.request<N8NWorkflow>('/api/v1/workflows', 'POST', workflow);
    }

    public async updateWorkflow(id: string, workflow: Partial<N8NWorkflow>): Promise<N8NWorkflow> {
        const cleanedWorkflow = this.cleanWorkflowForUpdate(workflow);
        return await this.request<N8NWorkflow>(`/api/v1/workflows/${id}`, 'PUT', cleanedWorkflow);
    }

    private cleanWorkflowForUpdate(workflow: any): any {
        if (!workflow || !workflow.nodes) {
            throw new Error('Invalid workflow structure');
        }

        const cleanedNodes = workflow.nodes.map((node: any) => {
            const cleanNode: any = {
                parameters: node.parameters || {},
                type: node.type,
                typeVersion: node.typeVersion || 1,
                position: node.position || [0, 0],
                id: node.id,
                name: node.name
            };

            if (node.webhookId) {
                cleanNode.webhookId = node.webhookId;
            }
            if (node.credentials) {
                cleanNode.credentials = node.credentials;
            }

            return cleanNode;
        });

        return {
            name: workflow.name || 'Untitled Workflow',
            nodes: cleanedNodes,
            connections: workflow.connections || {},
            settings: workflow.settings || {}
        };
    }

    public async deleteWorkflow(id: string): Promise<void> {
        await this.request<void>(`/api/v1/workflows/${id}`, 'DELETE');
    }

    public async testConnection(): Promise<boolean> {
        try {
            await this.listWorkflows();
            return true;
        } catch (error) {
            return false;
        }
    }
}
