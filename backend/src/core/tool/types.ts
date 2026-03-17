export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

export interface ToolExecutionContext {
  userId: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface BaseTool {
  definition: ToolDefinition;
  execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;
}

export abstract class AbstractTool implements BaseTool {
  abstract definition: ToolDefinition;
  
  abstract execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;
  
  protected success(data: any, metadata?: Record<string, any>): ToolResult {
    return { success: true, data, metadata };
  }
  
  protected failure(error: string, metadata?: Record<string, any>): ToolResult {
    return { success: false, error, metadata };
  }
}
