/**
 * Visualization Agent - 可视化生成器
 * 
 * 负责推荐图表类型并生成 ECharts 配置
 */

import { RuleBasedAgent } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  VisualizationOutput,
  ChartType,
  AlternativeChart,
} from '../types';

export interface VisualizationInput {
  data: Record<string, any>[];
  insights?: any[];
  chartPreference?: string;
}

export class VisualizationAgent extends RuleBasedAgent<VisualizationInput, VisualizationOutput> {
  definition: AgentDefinition = {
    name: 'visualization-agent',
    description: '推荐图表类型并生成 ECharts 配置',
    version: '1.0.0',
    layer: 'output',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array' },
        insights: { type: 'array' },
        chartPreference: { type: 'string' },
      },
      required: ['data'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        chartType: { type: 'string' },
        chartConfig: { type: 'object' },
        alternatives: { type: 'array' },
        explanation: { type: 'string' },
      },
    },
  };
  
  protected async run(input: VisualizationInput, context: AgentContext): Promise<VisualizationOutput> {
    const { data, insights, chartPreference } = input;
    
    // 如果数据为空
    if (!data || data.length === 0) {
      return {
        chartType: 'table',
        chartConfig: {},
        explanation: '没有数据，无法生成图表',
      };
    }
    
    // 分析数据特征
    const dataFeatures = this.analyzeDataFeatures(data);
    
    // 推荐图表类型
    const recommendedChart = this.recommendChart(dataFeatures, insights, chartPreference);
    
    // 生成 ECharts 配置
    const chartConfig = this.generateEChartsConfig(data, recommendedChart.chartType, dataFeatures);
    
    // 生成备选图表
    const alternatives = this.generateAlternatives(dataFeatures, recommendedChart.chartType);
    
    return {
      chartType: recommendedChart.chartType,
      chartConfig,
      alternatives,
      explanation: recommendedChart.reason,
    };
  }
  
  /**
   * 分析数据特征
   */
  private analyzeDataFeatures(data: Record<string, any>[]): DataFeatures {
    const firstRow = data[0];
    const fields = Object.keys(firstRow);
    
    const numericFields = fields.filter(f => typeof firstRow[f] === 'number');
    const stringFields = fields.filter(f => typeof firstRow[f] === 'string');
    const dateFields = fields.filter(f => this.isDateField(f, firstRow[f]));
    
    const rowCount = data.length;
    const hasTimeSeries = dateFields.length > 0 || 
      stringFields.some(f => /日期|时间|月|季度|年/i.test(f));
    
    return {
      rowCount,
      numericFields,
      stringFields,
      dateFields,
      hasTimeSeries,
      numericFieldCount: numericFields.length,
      categoryFieldCount: stringFields.length,
    };
  }
  
  /**
   * 判断是否是日期字段
   */
  private isDateField(fieldName: string, value: any): boolean {
    // 字段名包含日期关键词
    if (/日期|时间|date|time|年|月|日/i.test(fieldName)) {
      return true;
    }
    
    // 值是日期格式
    if (typeof value === 'string') {
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
        /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
        /^\d{4}年\d{1,2}月\d{1,2}日$/,   // 中文日期
      ];
      return datePatterns.some(p => p.test(value));
    }
    
    return false;
  }
  
  /**
   * 推荐图表类型
   */
  private recommendChart(
    features: DataFeatures,
    insights?: any[],
    preference?: string
  ): { chartType: ChartType; reason: string } {
    
    // 优先使用用户偏好
    if (preference) {
      const chartType = this.parseChartPreference(preference);
      if (chartType) {
        return { chartType, reason: '根据用户偏好选择' };
      }
    }
    
    // 根据洞察类型推荐
    if (insights && insights.length > 0) {
      const insightTypes = insights.map((i: any) => i.type);
      
      if (insightTypes.includes('trend') && features.hasTimeSeries) {
        return { chartType: 'line', reason: '趋势型数据适合折线图' };
      }
      
      if (insightTypes.includes('comparison')) {
        return { chartType: 'bar', reason: '对比型数据适合柱状图' };
      }
      
      if (insightTypes.includes('distribution')) {
        return { chartType: 'pie', reason: '分布型数据适合饼图' };
      }
    }
    
    // 根据数据特征推荐
    if (features.hasTimeSeries && features.numericFieldCount >= 1) {
      return { chartType: 'line', reason: '时间序列数据适合折线图' };
    }
    
    if (features.categoryFieldCount >= 1 && features.numericFieldCount === 1) {
      if (features.rowCount <= 10) {
        return { chartType: 'pie', reason: '少量分类数据适合饼图' };
      }
      return { chartType: 'bar', reason: '分类数据适合柱状图' };
    }
    
    if (features.numericFieldCount >= 2) {
      return { chartType: 'scatter', reason: '多数值字段适合散点图' };
    }
    
    if (features.rowCount === 1) {
      return { chartType: 'card', reason: '单条数据适合指标卡' };
    }
    
    // 默认返回表格
    return { chartType: 'table', reason: '数据结构复杂，表格最清晰' };
  }
  
  /**
   * 解析用户偏好
   */
  private parseChartPreference(preference: string): ChartType | null {
    const mapping: Record<string, ChartType> = {
      '折线图': 'line',
      '线图': 'line',
      'line': 'line',
      '柱状图': 'bar',
      '条形图': 'bar',
      'bar': 'bar',
      '饼图': 'pie',
      'pie': 'pie',
      '散点图': 'scatter',
      'scatter': 'scatter',
      '雷达图': 'radar',
      'radar': 'radar',
      '表格': 'table',
      'table': 'table',
    };
    
    for (const [key, value] of Object.entries(mapping)) {
      if (preference.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    
    return null;
  }
  
  /**
   * 生成 ECharts 配置
   */
  private generateEChartsConfig(
    data: Record<string, any>[],
    chartType: ChartType,
    features: DataFeatures
  ): Record<string, any> {
    
    switch (chartType) {
      case 'line':
        return this.generateLineConfig(data, features);
      case 'bar':
        return this.generateBarConfig(data, features);
      case 'pie':
        return this.generatePieConfig(data, features);
      case 'scatter':
        return this.generateScatterConfig(data, features);
      case 'radar':
        return this.generateRadarConfig(data, features);
      case 'card':
        return this.generateCardConfig(data);
      case 'table':
      default:
        return {};
    }
  }
  
  /**
   * 生成折线图配置
   */
  private generateLineConfig(data: Record<string, any>[], features: DataFeatures): any {
    const xField = features.dateFields[0] || features.stringFields[0];
    const yFields = features.numericFields;
    
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: yFields },
      xAxis: {
        type: 'category',
        data: data.map(d => d[xField]),
      },
      yAxis: { type: 'value' },
      series: yFields.map(field => ({
        name: field,
        type: 'line',
        data: data.map(d => d[field]),
        smooth: true,
      })),
    };
  }
  
  /**
   * 生成柱状图配置
   */
  private generateBarConfig(data: Record<string, any>[], features: DataFeatures): any {
    const xField = features.stringFields[0] || features.dateFields[0];
    const yFields = features.numericFields;
    
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: yFields },
      xAxis: {
        type: 'category',
        data: data.map(d => d[xField]),
      },
      yAxis: { type: 'value' },
      series: yFields.map(field => ({
        name: field,
        type: 'bar',
        data: data.map(d => d[field]),
      })),
    };
  }
  
  /**
   * 生成饼图配置
   */
  private generatePieConfig(data: Record<string, any>[], features: DataFeatures): any {
    const nameField = features.stringFields[0];
    const valueField = features.numericFields[0];
    
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: '50%',
        data: data.map(d => ({
          name: d[nameField],
          value: d[valueField],
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }],
    };
  }
  
  /**
   * 生成散点图配置
   */
  private generateScatterConfig(data: Record<string, any>[], features: DataFeatures): any {
    const [xField, yField] = features.numericFields.slice(0, 2);
    
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: xField },
      yAxis: { type: 'value', name: yField },
      series: [{
        type: 'scatter',
        data: data.map(d => [d[xField], d[yField]]),
        symbolSize: 10,
      }],
    };
  }
  
  /**
   * 生成雷达图配置
   */
  private generateRadarConfig(data: Record<string, any>[], features: DataFeatures): any {
    const dimensions = features.stringFields;
    const metrics = features.numericFields.slice(0, 5); // 最多 5 个维度
    
    return {
      tooltip: {},
      legend: { data: dimensions },
      radar: {
        indicator: metrics.map(m => ({ name: m, max: 100 })),
      },
      series: [{
        type: 'radar',
        data: dimensions.map(dim => ({
          name: dim,
          value: metrics.map(m => data.find(d => d[dimensions[0]] === dim)?.[m] || 0),
        })),
      }],
    };
  }
  
  /**
   * 生成指标卡配置
   */
  private generateCardConfig(data: Record<string, any>[]): any {
    const row = data[0];
    const metrics = Object.entries(row)
      .filter(([_, v]) => typeof v === 'number')
      .map(([k, v]) => ({ name: k, value: v }));
    
    return { metrics };
  }
  
  /**
   * 生成备选图表
   */
  private generateAlternatives(features: DataFeatures, recommended: ChartType): AlternativeChart[] {
    const alternatives: AlternativeChart[] = [];
    
    // 根据数据特征生成备选
    if (recommended !== 'bar' && features.categoryFieldCount >= 1) {
      alternatives.push({ chartType: 'bar', reason: '柱状图可以清晰展示分类对比' });
    }
    
    if (recommended !== 'line' && features.hasTimeSeries) {
      alternatives.push({ chartType: 'line', reason: '折线图适合展示时间趋势' });
    }
    
    if (recommended !== 'pie' && features.rowCount <= 8 && features.numericFieldCount === 1) {
      alternatives.push({ chartType: 'pie', reason: '饼图适合展示占比分布' });
    }
    
    return alternatives.slice(0, 2); // 最多 2 个备选
  }
}

interface DataFeatures {
  rowCount: number;
  numericFields: string[];
  stringFields: string[];
  dateFields: string[];
  hasTimeSeries: boolean;
  numericFieldCount: number;
  categoryFieldCount: number;
}
