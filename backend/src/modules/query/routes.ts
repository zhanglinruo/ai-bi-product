import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database';
import { jwtConfig } from '../../config/index';
import { globalToolRegistry } from '../../core/tool';
import { ToolExecutionContext } from '../../core/tool/types';
import { buildSchemaPrompt } from '../../config/llm';
import { semanticService, sqlValidator } from '../../core/semantic';
import { analyzerService } from '../../core/analyzer';
import { sendProgress, sendComplete, sendError } from '../progress/routes';

const router = Router();

function getUserIdFromToken(req: Request): string | null {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded: any = jwt.verify(token, jwtConfig.secret);
    return decoded.id;
  } catch {
    return null;
  }
}

function cleanSQL(sql: string): string {
  let cleaned = sql.replace(/```sql|```/g, '').trim();
  const tagStart = '<think>';
  const tagEnd = '</think>';
  const thinkStart = cleaned.indexOf(tagStart);
  if (thinkStart > -1) {
    const thinkEnd = cleaned.indexOf(tagEnd);
    if (thinkEnd > -1) {
      cleaned = cleaned.substring(0, thinkStart) + cleaned.substring(thinkEnd + tagEnd.length);
    }
  }
  const sqlMatch = cleaned.match(/SELECT.*/is);
  if (sqlMatch) {
    return sqlMatch[0].trim();
  }
  return cleaned.trim();
}

router.post('/execute', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  let retryCount = 0;
  const maxRetries = 3;
  let lastError: string | null = null;
  let effectiveSessionId = '';

  const sendProgressSafe = (sessionId: string, step: string, message: string, data?: any) => {
    try {
      sendProgress(sessionId, { step, message, data, timestamp: Date.now() });
    } catch (e) {
      console.error('[进度推送失败]', e);
    }
  };

  while (retryCount < maxRetries) {
    try {
      const { question, datasourceId, sessionId } = _req.body;
      const userId = getUserIdFromToken(_req);
      effectiveSessionId = sessionId || uuidv4();

      if (!question) {
        return res.status(400).json({ success: false, message: '问题不能为空' });
      }

      if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
      }

      const context: ToolExecutionContext = {
        userId,
        sessionId: effectiveSessionId
      };

      console.log('═══════════════════════════════════════');
      console.log('[查询] 用户问题: ' + question);

      sendProgressSafe(effectiveSessionId, 'semantic', '正在解析语义...');

      const semanticResult = await semanticService.search(question, context);
      const semanticPrompt = await semanticService.buildSemanticPrompt(semanticResult.matches);

      if (!semanticResult.isMatchValid || semanticResult.matches.length === 0) {
        console.log('[语义层] ⚠️ 未匹配到有效语义内容');
        sendProgressSafe(effectiveSessionId, 'error', '未匹配到语义定义');
        return res.json({
          success: false,
          message: '您的问题未匹配到语义层定义，请换一种表述方式或联系管理员添加语义定义。',
          semanticMatched: false,
          suggestion: '尝试使用明确的业务术语，如"采购金额"、"企业集团"等'
        });
      }

      console.log('[语义层] ✅ 匹配到 ' + semanticResult.matches.length + ' 个语义对象');
       console.log('[语义层] 业务域: ' + (semanticResult.businessDomain || '通用'));
       sendProgressSafe(effectiveSessionId, 'semantic', `匹配到 ${semanticResult.matches.length} 个语义对象`, {
        matches: semanticResult.matches.map((m: any) => ({ name: m.name, type: m.type })),
        businessDomain: semanticResult.businessDomain
      });

      sendProgressSafe(effectiveSessionId, 'template', '正在匹配分析模板...');
      const analysisResult = await analyzerService.analyze(question, effectiveSessionId, context);
      console.log('[查询] 分析结果:', JSON.stringify(analysisResult).substring(0, 200));
      
      if (analysisResult) {
        console.log('[Analyzer] ✅ 执行分析模板: ' + analysisResult.template);
        sendProgressSafe(effectiveSessionId, 'analysis', `正在执行分析模板: ${analysisResult.template}`, { steps: analysisResult.steps?.length });
        
        const queryId = uuidv4();
        const userId = getUserIdFromToken(_req);
        if (userId) {
          await query(
            'INSERT INTO query_history (id, user_id, question, sql_generated, result_data, conclusion, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [queryId, userId, question, JSON.stringify({ analysis: true, template: analysisResult.template }), JSON.stringify(analysisResult.steps), analysisResult.finalReport || '', 'success']
          );
        }

        sendProgressSafe(effectiveSessionId, 'complete', '分析完成', { template: analysisResult.template });

        return res.json({
          success: true,
          data: {
            id: queryId,
            question,
            type: 'analysis',
            template: analysisResult.template,
            steps: analysisResult.steps,
            finalReport: analysisResult.finalReport,
            anomalies: analysisResult.anomalies,
            opportunities: analysisResult.opportunities,
            executionTime: Date.now() - startTime
          },
          semanticMatched: true,
          semanticInfo: {
            matchedCount: semanticResult.matches.length,
            businessDomain: semanticResult.businessDomain
          }
        });
      }

      sendProgressSafe(effectiveSessionId, 'sql', '正在生成SQL...');

      const schema = buildSchemaPrompt();
      const sqlPrompt = `
你是一个严格遵循企业统一语义层的数据分析助手，你的唯一准则是：100%基于语义层定义生成内容，绝对禁止越界。

【不可突破的铁则】
1. 你必须严格使用下方【语义层匹配结果】中提供的指标、术语、维度、业务规则、数据映射关系，绝对禁止使用语义层以外的任何表、字段、计算逻辑。
2. 如果【语义层匹配结果】中没有用户提问对应的内容，你必须直接告知用户，禁止编造任何指标定义、计算逻辑、表关联关系。
3. 所有计算必须100%遵循语义层定义的业务口径、技术口径、过滤规则，禁止自行修改、简化、补充口径逻辑。
4. 生成的SQL必须完全基于语义层提供的数据映射关系，禁止自行关联未定义的表、新增未定义的过滤条件。
5. 若用户的提问与语义层定义冲突，以语义层定义为准，同时告知用户口径差异。

${semanticPrompt}
【数据表结构】
${schema}

用户问题: ${question}

请直接生成SQL语句，不要有任何思考过程，只返回SQL语句。
`;

      const llmTool = globalToolRegistry.get('llm');
      const sqlResult = await llmTool!.execute({
        userPrompt: '用户问题: ' + question + '\n请直接生成SQL语句:',
        systemPrompt: sqlPrompt
      }, context);

      if (!sqlResult.success) {
        throw new Error(sqlResult.error || 'SQL生成失败');
      }

      let sql = cleanSQL(sqlResult.data.content);
      console.log('[SQL] 生成的SQL: ' + sql);
      sendProgressSafe(effectiveSessionId, 'sql', 'SQL生成完成', { sql: sql.substring(0, 100) });

      sendProgressSafe(effectiveSessionId, 'entityFix', '正在修正实体值...');
      const entityFixerTool = globalToolRegistry.get('entityFixer');
      const entityFixResult = await entityFixerTool!.execute({ sql }, context);
      if (entityFixResult.success && entityFixResult.data.fixes && entityFixResult.data.fixes.length > 0) {
        sql = entityFixResult.data.fixedSql;
        console.log('[实体修正] 完成 ' + entityFixResult.data.fixes.length + ' 处修正');
        for (const fix of entityFixResult.data.fixes) {
          console.log(`[实体修正] ${fix.field}: "${fix.original}" -> "${fix.corrected}" (${fix.method})`);
        }
        console.log('[实体修正] 修正后SQL: ' + sql);
        sendProgressSafe(effectiveSessionId, 'entityFix', `完成 ${entityFixResult.data.fixes.length} 处实体值修正`);
      } else {
        sendProgressSafe(effectiveSessionId, 'entityFix', '无需修正');
      }

      sendProgressSafe(effectiveSessionId, 'validate', '正在校验SQL...');
      const validation = await sqlValidator.validate(sql);
      if (!validation.isValid) {
        console.log('[SQL校验] ❌ 校验失败:', validation.errors);
        sendProgressSafe(effectiveSessionId, 'error', 'SQL校验失败: ' + validation.errors.join('; '));
        if (retryCount < maxRetries - 1) {
          retryCount++;
          console.log('[重试] 第 ' + retryCount + ' 次重试...');
          sendProgressSafe(effectiveSessionId, 'retry', `第 ${retryCount} 次重试...`);
          continue;
        } else {
          throw new Error('SQL校验失败: ' + validation.errors.join('; '));
        }
      }
      sendProgressSafe(effectiveSessionId, 'validate', 'SQL校验通过');

      sendProgressSafe(effectiveSessionId, 'execute', '正在执行SQL查询...');
      const sqlExecTool = globalToolRegistry.get('sql');
      const execResult = await sqlExecTool!.execute({ sql, limit: 1000 }, context);

      if (!execResult.success) {
        throw new Error(execResult.error || 'SQL执行失败');
      }

      const data = execResult.data.rows;
      console.log('[数据] 返回 ' + data.length + ' 条记录');
      sendProgressSafe(effectiveSessionId, 'execute', `查询完成，返回 ${data.length} 条记录`);

      sendProgressSafe(effectiveSessionId, 'conclusion', '正在生成分析结论...');
      const conclusionPrompt = `
你是一个数据分析专家。根据用户的问题、语义层定义、SQL查询结果，给出简洁的数据分析结论。

要求：
1. 用中文回答
2. 结论要基于数据，提到具体的数字和变化
3. 保持简洁，不超过100字
4. 只返回结论，不要其他解释
`;

      const dataSummary = JSON.stringify(data.slice(0, 10));
      const conclusionResult = await llmTool!.execute({
        userPrompt: '用户问题: ' + question + '\n语义层定义: ' + semanticPrompt + '\n执行的SQL: ' + sql + '\n查询结果（前10条）: ' + dataSummary + '\n请给出分析结论:',
        systemPrompt: conclusionPrompt
      }, context);

      const conclusion = conclusionResult.success ? conclusionResult.data.content : '暂无结论';
      console.log('[结论] ' + conclusion);
      sendProgressSafe(effectiveSessionId, 'conclusion', '分析结论生成完成');

      const chartType = determineChartType(question, data);

      const executionTime = Date.now() - startTime;
      console.log('[耗时] ' + executionTime + 'ms');
      console.log('═══════════════════════════════════════');

      const queryId = uuidv4();
      await query(
        'INSERT INTO query_history (id, user_id, question, sql_query, result_data, conclusion, chart_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'success\', NOW())',
        [queryId, userId, question, sql, JSON.stringify(data), conclusion, chartType]
      );

      sendProgressSafe(effectiveSessionId, 'complete', '查询完成', { 
        id: queryId, 
        executionTime,
        recordCount: data.length 
      });

      return res.json({
        success: true,
        data: {
          id: queryId,
          question,
          sql,
          result: data,
          conclusion,
          chartType,
          executionTime
        },
        semanticMatched: true,
        semanticInfo: {
          matchedCount: semanticResult.matches.length,
          businessDomain: semanticResult.businessDomain
        }
      });

    } catch (error: any) {
      lastError = error.message;
      console.error('[查询错误] ' + error.message);
      
      if (effectiveSessionId) {
        sendProgressSafe(effectiveSessionId, 'error', '执行出错: ' + error.message);
      }
      
      if (retryCount < maxRetries - 1) {
        retryCount++;
        console.log('[重试] 第 ' + retryCount + ' 次重试...');
      } else {
        const queryId = uuidv4();
        const userId = getUserIdFromToken(_req);
        if (userId) {
          await query(
            'INSERT INTO query_history (id, user_id, question, status, error_message, created_at) VALUES (?, ?, ?, \'failed\', ?, NOW())',
            [queryId, userId, _req.body.question, lastError]
          );
        }
        
        return res.status(500).json({ 
          success: false, 
          message: lastError,
          retryCount: retryCount
        });
      }
    }
  }
});

function determineChartType(userQuestion: string, data: any[]): string {
  const question = userQuestion.toLowerCase();
  
  if (question.includes('趋势') || question.includes('变化') || question.includes('时间')) {
    return 'line';
  }
  if (question.includes('占比') || question.includes('比例') || question.includes('分布')) {
    return 'pie';
  }
  if (question.includes('排名') || question.includes('top') || question.includes('前')) {
    return 'bar';
  }
  
  if (data.length > 0 && data[0]?.value !== undefined) {
    return 'bar';
  }
  
  return 'table';
}

router.get('/history', async (_req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(_req);
    if (!userId) {
      return res.status(401).json({ success: false, message: '未授权' });
    }
    
    const limit = parseInt(_req.query.limit as string) || 20;
    const offset = parseInt(_req.query.offset as string) || 0;
    const history = await query<any[]>(
      'SELECT * FROM query_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/history/:id', async (_req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(_req);
    if (!userId) {
      return res.status(401).json({ success: false, message: '未授权' });
    }
    
    const results = await query<any[]>('SELECT * FROM query_history WHERE id = ? AND user_id = ?', [_req.params.id, userId]);
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: '查询记录不存在' });
    }
    res.json({ success: true, data: results[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
