export * from './types';
export * from './registry';
export * from './llm';
export * from './sql';
export * from './entityFixer';
export * from './dataAnalyzer';

import { globalToolRegistry } from './registry';
import { LLMTool } from './llm';
import { SQLTool } from './sql';
import { EntityFixerTool } from './entityFixer';
import { DataAnalyzerTool } from './dataAnalyzer';

export function initializeTools(): void {
  globalToolRegistry.register(LLMTool.createDefault());
  globalToolRegistry.register(new SQLTool());
  globalToolRegistry.register(new EntityFixerTool());
  globalToolRegistry.register(new DataAnalyzerTool());
  
  console.log(`✅ 工具注册完成，共 ${globalToolRegistry.getAll().length} 个工具`);
  globalToolRegistry.getAll().forEach(tool => {
    console.log(`   - ${tool.name}: ${tool.description}`);
  });
}
