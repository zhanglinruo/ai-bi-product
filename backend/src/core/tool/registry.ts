import { BaseTool, ToolDefinition } from './types';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  
  register(tool: BaseTool): void {
    this.tools.set(tool.definition.name, tool);
  }
  
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }
  
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }
  
  getByCategory(category: string): BaseTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.definition.description.includes(category)
    );
  }
  
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const globalToolRegistry = new ToolRegistry();
