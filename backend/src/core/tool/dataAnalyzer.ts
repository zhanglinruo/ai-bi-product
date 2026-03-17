import { AbstractTool, ToolDefinition, ToolResult, ToolExecutionContext } from './types';

interface DataAnalyzerInput {
  data: any[];
  analysisType?: string;
}

interface AnalysisMethod {
  name: string;
  description: string;
}

const AVAILABLE_METHODS: AnalysisMethod[] = [
  { name: 'anomaly_detection', description: '异常识别 - 识别数值特别高或特别低的记录，检测数据异常点' },
  { name: 'trend_analysis', description: '趋势分析 - 分析数据随时间或其他有序维度的变化趋势' },
  { name: 'distribution_analysis', description: '分布分析 - 分析数据的分布情况，识别集中区间和离散程度' },
  { name: 'correlation_analysis', description: '相关性分析 - 分析不同字段之间的相关关系' },
  { name: 'ranking_analysis', description: '排名分析 - 识别Top N和Bottom N的数据' },
  { name: 'statistical_summary', description: '统计摘要 - 计算基本统计指标（均值、中位数、最大最小值等）' },
  { name: 'comparison_analysis', description: '对比分析 - 对比不同组别或不同时间的数据差异' }
];

export class DataAnalyzerTool extends AbstractTool {
  definition: ToolDefinition = {
    name: 'dataAnalyzer',
    description: '数据分析工具 - 提供多种数据分析方法，包括异常识别、趋势分析、分布分析、相关性分析等，根据数据情况自动选择合适的分析方法',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: '要分析的数据数组' },
        analysisType: { 
          type: 'string', 
          description: '分析方法类型，可选值：anomaly_detection, trend_analysis, distribution_analysis, correlation_analysis, ranking_analysis, statistical_summary, comparison_analysis, auto（自动选择）'
        }
      },
      required: ['data']
    },
    outputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        insights: { type: 'array' },
        findings: { type: 'object' },
        recommendations: { type: 'array' }
      }
    }
  };

  async execute(input: DataAnalyzerInput, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { data, analysisType = 'auto' } = input;
      
      if (!data || data.length === 0) {
        return { success: true, data: { insights: [], findings: {}, recommendations: ['无数据可分析'] } };
      }

      console.log('[DataAnalyzer] 收到数据:', data.length, '条');
      console.log('[DataAnalyzer] 请求的分析类型:', analysisType);

      let method = analysisType;
      if (analysisType === 'auto') {
        method = this.selectBestMethod(data);
        console.log('[DataAnalyzer] 自动选择方法:', method);
      }

      let result: any;
      switch (method) {
        case 'anomaly_detection':
          result = this.anomalyDetection(data);
          break;
        case 'trend_analysis':
          result = this.trendAnalysis(data);
          break;
        case 'distribution_analysis':
          result = this.distributionAnalysis(data);
          break;
        case 'correlation_analysis':
          result = this.correlationAnalysis(data);
          break;
        case 'ranking_analysis':
          result = this.rankingAnalysis(data);
          break;
        case 'comparison_analysis':
          result = this.comparisonAnalysis(data);
          break;
        case 'statistical_summary':
        default:
          result = this.statisticalSummary(data);
          break;
      }

      return {
        success: true,
        data: {
          method,
          ...result
        }
      };
    } catch (error: any) {
      console.error('[DataAnalyzer] 分析失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  private selectBestMethod(data: any[]): string {
    if (!data || data.length === 0) return 'statistical_summary';
    
    const sample = data[0];
    const numericFields = this.getNumericFields(sample);
    
    if (numericFields.length === 0) return 'statistical_summary';
    
    if (data.length > 10) {
      return 'anomaly_detection';
    }
    
    return 'statistical_summary';
  }

  private getNumericFields(obj: any): string[] {
    const fields: string[] = [];
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val))) {
        fields.push(key);
      }
    }
    return fields;
  }

  private anomalyDetection(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const anomalies: any[] = [];
    const insights: string[] = [];
    const findings: any = {};

    for (const field of numericFields) {
      const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
      const threshold = 2 * stdDev;

      const fieldAnomalies = data.filter(d => {
        const val = parseFloat(d[field]);
        return Math.abs(val - mean) > threshold;
      });

      if (fieldAnomalies.length > 0) {
        anomalies.push(...fieldAnomalies.slice(0, 5));
        insights.push(`字段 ${field} 发现 ${fieldAnomalies.length} 个异常值（偏离均值超过2倍标准差）`);
      }

      findings[field] = { mean, median, stdDev, anomalyCount: fieldAnomalies.length };
    }

    if (anomalies.length === 0) {
      insights.push('未发现明显异常值');
    }

    return {
      insights,
      findings,
      recommendations: anomalies.length > 0 ? ['建议进一步调查异常数据点'] : ['数据整体正常']
    };
  }

  private trendAnalysis(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};

    const timeFields = ['date', 'month', 'year', 'quarter', 'time'];
    const timeField = Object.keys(data[0] || {}).find(f => timeFields.some(t => f.toLowerCase().includes(t)));

    for (const field of numericFields) {
      const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
      if (values.length < 2) continue;

      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const changeRate = ((secondAvg - firstAvg) / firstAvg * 100).toFixed(2);

      let trend = 'stable';
      if (parseFloat(changeRate) > 10) trend = 'increasing';
      else if (parseFloat(changeRate) < -10) trend = 'decreasing';

      findings[field] = { trend, changeRate: parseFloat(changeRate) };
      insights.push(`字段 ${field}: ${trend === 'increasing' ? '上升' : trend === 'decreasing' ? '下降' : '稳定'}趋势，变化率 ${changeRate}%`);
    }

    return {
      insights,
      findings,
      recommendations: findings && Object.keys(findings).length > 0 ? ['可进一步分析趋势原因'] : ['数据不足以进行趋势分析']
    };
  }

  private distributionAnalysis(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};

    for (const field of numericFields) {
      const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      const bins = 5;
      const binSize = range / bins;
      
      const distribution: Record<string, number> = {};
      values.forEach(v => {
        const binIndex = Math.min(Math.floor((v - min) / binSize), bins - 1);
        const binLabel = `${(min + binIndex * binSize).toFixed(0)}-${(min + (binIndex + 1) * binSize).toFixed(0)}`;
        distribution[binLabel] = (distribution[binLabel] || 0) + 1;
      });

      findings[field] = { min, max, range, distribution };
      insights.push(`字段 ${field}: 范围 [${min.toFixed(2)}, ${max.toFixed(2)}]，主要分布在 ${Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0]}`);
    }

    return {
      insights,
      findings,
      recommendations: ['根据分布情况选择合适的统计方法']
    };
  }

  private correlationAnalysis(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};
    const correlations: any[] = [];

    if (numericFields.length < 2) {
      return {
        insights: ['字段数量不足，无法进行相关性分析'],
        findings: {},
        recommendations: ['增加数值字段数量']
      };
    }

    for (let i = 0; i < numericFields.length; i++) {
      for (let j = i + 1; j < numericFields.length; j++) {
        const field1 = numericFields[i];
        const field2 = numericFields[j];
        
        const pairs = data
          .map(d => ({ x: parseFloat(d[field1]), y: parseFloat(d[field2]) }))
          .filter(p => !isNaN(p.x) && !isNaN(p.y));

        if (pairs.length < 3) continue;

        const xMean = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
        const yMean = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
        
        let numerator = 0;
        let denomX = 0;
        let denomY = 0;
        
        for (const p of pairs) {
          numerator += (p.x - xMean) * (p.y - yMean);
          denomX += Math.pow(p.x - xMean, 2);
          denomY += Math.pow(p.y - yMean, 2);
        }
        
        const correlation = numerator / Math.sqrt(denomX * denomY);
        
        correlations.push({ field1, field2, correlation: parseFloat(correlation.toFixed(3)) });
        
        if (Math.abs(correlation) > 0.7) {
          insights.push(`${field1} 与 ${field2} 存在${correlation > 0 ? '强正' : '强负'}相关 (r=${correlation.toFixed(3)})`);
        }
      }
    }

    findings.correlations = correlations;
    
    if (insights.length === 0) {
      insights.push('未发现显著相关性');
    }

    return {
      insights,
      findings,
      recommendations: ['相关性不等于因果性，需进一步分析']
    };
  }

  private rankingAnalysis(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};

    for (const field of numericFields.slice(0, 2)) {
      const sorted = [...data].sort((a, b) => (parseFloat(b[field]) || 0) - (parseFloat(a[field]) || 0));
      const top5 = sorted.slice(0, 5).map((d, i) => ({ rank: i + 1, ...d }));
      const bottom5 = sorted.slice(-5).reverse().map((d, i) => ({ rank: sorted.length - i, ...d }));

      findings[field] = { top5, bottom5 };
      
      const nameField = Object.keys(data[0] || {}).find(k => k.includes('name') || k.includes('group') || k.includes('region'));
      if (nameField) {
        insights.push(`字段 ${field} Top3: ${top5.slice(0, 3).map(d => d[nameField]).join(', ')}`);
      }
    }

    return {
      insights,
      findings,
      recommendations: ['关注排名靠前的业务单元表现']
    };
  }

  private comparisonAnalysis(data: any[]): any {
    const nonNumericFields = Object.keys(data[0] || {}).filter(k => !this.getNumericFields(data[0]).includes(k));
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};

    const groupField = nonNumericFields.find(f => f.includes('group') || f.includes('region') || f.includes('province') || f.includes('city'));
    
    if (!groupField || numericFields.length === 0) {
      return {
        insights: ['数据不足以进行对比分析'],
        findings: {},
        recommendations: ['需要分组字段和数值字段']
      };
    }

    const groups: Record<string, any[]> = {};
    data.forEach(d => {
      const key = d[groupField];
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });

    for (const field of numericFields.slice(0, 2)) {
      const groupStats: Record<string, { sum: number; avg: number; count: number }> = {};
      for (const [group, items] of Object.entries(groups)) {
        const values = (items as any[]).map(d => parseFloat(d[field])).filter(v => !isNaN(v));
        if (values.length > 0) {
          groupStats[group] = {
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            count: values.length
          };
        }
      }
      findings[field] = groupStats;
      
      const sortedGroups = Object.entries(groupStats).sort((a, b) => b[1].avg - a[1].avg);
      if (sortedGroups.length > 0) {
        insights.push(`${field}: ${sortedGroups[0][0]} 最高 (平均 ${sortedGroups[0][1].avg.toFixed(2)})`);
      }
    }

    return {
      insights,
      findings,
      recommendations: ['可针对不同组别制定差异化策略']
    };
  }

  private statisticalSummary(data: any[]): any {
    const numericFields = this.getNumericFields(data[0] || {});
    const insights: string[] = [];
    const findings: any = {};

    for (const field of numericFields) {
      const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      findings[field] = {
        count: values.length,
        sum: parseFloat(sum.toFixed(2)),
        avg: parseFloat(mean.toFixed(2)),
        median: parseFloat(median.toFixed(2)),
        min: parseFloat(min.toFixed(2)),
        max: parseFloat(max.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2))
      };

      insights.push(`${field}: 均值=${mean.toFixed(2)}, 中位数=${median.toFixed(2)}, 范围[${min.toFixed(2)}, ${max.toFixed(2)}]`);
    }

    return {
      insights,
      findings,
      recommendations: insights.length > 0 ? ['数据统计完成，可根据需要进一步分析'] : ['无数值字段可供统计']
    };
  }
}

export const dataAnalyzerTool = new DataAnalyzerTool();
