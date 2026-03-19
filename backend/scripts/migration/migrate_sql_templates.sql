-- SQL 模板初始数据
-- 从 sqlQA.md 迁移

INSERT INTO sql_templates (name, description, sql_template, keywords, dimensions, metrics, category, datasource_id, is_active, created_by) VALUES
(
  '集团药品占有率分析（按省份）',
  '按省份分析各集团药品的销量和占有率，支持排名',
  'SELECT
    `province`,
    `corporate_group`,
    `group_quantity`,
    `market_share`,
    `rank`
FROM (
    SELECT
        `province`,
        `corporate_group`,
        `group_quantity`,
        `market_share`,
        @rank := IF(@prev_province = `province`, @rank + 1, 1) AS `rank`,
        @prev_province := `province` AS `prev_province`
    FROM (
        SELECT
            t1.`province`,
            t1.`corporate_group`,
            SUM(t1.`quantity`) AS `group_quantity`,
            t2.`total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`total_quantity` * 100, 2) AS `market_share`
        FROM `t_ai_medical_product_records` t1
        JOIN (
            SELECT
                `province`,
                SUM(`quantity`) AS `total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `is_delete` = 0
            GROUP BY `province`
        ) t2 ON t1.`province` = t2.`province`
        WHERE t1.`is_delete` = 0
            AND t1.`record_date` >= {{start_date}} AND t1.`record_date` <= {{end_date}}
        GROUP BY t1.`province`, t1.`corporate_group`
        ORDER BY t1.`province`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_province := '''') vars
) final
{{#if group_name}}
WHERE `corporate_group` LIKE ''%{{group_name}}%''
{{/if}}
ORDER BY `province`, `rank`
LIMIT 100',
  '占有率,market_share,集团,province,省份,集团药品占有率',
  'province,corporate_group',
  'quantity,total_quantity',
  'market_share',
  NULL,
  1,
  'system'
),
(
  '医院维度集团药品占有率',
  '按医院分析各集团药品的销量和占有率',
  'SELECT
    `hospital_name`,
    `corporate_group`,
    `group_quantity`,
    `market_share`,
    `rank`
FROM (
    SELECT
        `hospital_name`,
        `corporate_group`,
        `group_quantity`,
        `market_share`,
        @rank := IF(@prev_hospital = `hospital_name`, @rank + 1, 1) AS `rank`,
        @prev_hospital := `hospital_name` AS `prev_hospital`
    FROM (
        SELECT
            t1.`hospital_name`,
            t1.`corporate_group`,
            SUM(t1.`quantity`) AS `group_quantity`,
            t2.`total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`total_quantity` * 100, 2) AS `market_share`
        FROM `t_ai_medical_product_records` t1
        JOIN (
            SELECT
                `hospital_name`,
                SUM(`quantity`) AS `total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `is_delete` = 0
            GROUP BY `hospital_name`
        ) t2 ON t1.`hospital_name` = t2.`hospital_name`
        WHERE t1.`is_delete` = 0
            AND t1.`record_date` >= {{start_date}} AND t1.`record_date` <= {{end_date}}
        GROUP BY t1.`hospital_name`, t1.`corporate_group`
        ORDER BY t1.`hospital_name`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_hospital := '''') vars
) final
{{#if group_name}}
WHERE `corporate_group` LIKE ''%{{group_name}}%''
{{/if}}
ORDER BY `hospital_name`, `rank`
LIMIT 100',
  '占有率,医院,hospital_name,集团药品占有率',
  'hospital_name,corporate_group',
  'quantity',
  'market_share',
  NULL,
  1,
  'system'
),
(
  '销量最高的前N名产品',
  '按销量降序排列，取前N个产品',
  'SELECT
    `product_name`,
    `generic_name`,
    `brand_name`,
    `manufacturer`,
    SUM(`quantity`) AS `total_quantity`
FROM `t_ai_medical_product_records`
WHERE `is_delete` = 0
    AND `record_date` >= {{start_date}} AND `record_date` <= {{end_date}}
GROUP BY `product_name`, `generic_name`, `brand_name`, `manufacturer`
ORDER BY `total_quantity` DESC
LIMIT {{limit}}',
  '销量,排行,排名,top,前N,销售排行,产品排名',
  'product_name',
  'quantity',
  'ranking',
  NULL,
  1,
  'system'
),
(
  '医院等级维度集团占有率',
  '按医院等级分析各集团药品的占有率',
  'SELECT
    `hospital_level`,
    `corporate_group`,
    `group_quantity`,
    `market_share`,
    `rank`
FROM (
    SELECT
        `hospital_level`,
        `corporate_group`,
        `group_quantity`,
        `market_share`,
        @rank := IF(@prev_level = `hospital_level`, @rank + 1, 1) AS `rank`,
        @prev_level := `hospital_level` AS `prev_level`
    FROM (
        SELECT
            t1.`hospital_level`,
            t1.`corporate_group`,
            SUM(t1.`quantity`) AS `group_quantity`,
            t2.`total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`total_quantity` * 100, 2) AS `market_share`
        FROM `t_ai_medical_product_records` t1
        JOIN (
            SELECT
                `hospital_level`,
                SUM(`quantity`) AS `total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `is_delete` = 0
            GROUP BY `hospital_level`
        ) t2 ON t1.`hospital_level` = t2.`hospital_level`
        WHERE t1.`is_delete` = 0
            AND t1.`record_date` >= {{start_date}} AND t1.`record_date` <= {{end_date}}
        GROUP BY t1.`hospital_level`, t1.`corporate_group`
        ORDER BY t1.`hospital_level`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_level := '''') vars
) final
{{#if group_name}}
WHERE `corporate_group` LIKE ''%{{group_name}}%''
{{/if}}
ORDER BY `hospital_level`, `rank`
LIMIT 100',
  '占有率,hospital_level,医院等级,集团药品占有率',
  'hospital_level,corporate_group',
  'quantity',
  'market_share',
  NULL,
  1,
  'system'
),
(
  '月度趋势分析',
  '按月份分析指标的变动趋势',
  'SELECT
    `month`,
    `metric_field`,
    `metric_value`,
    `prev_value`,
    `growth_rate`
FROM (
    SELECT
        DATE_FORMAT(t1.`record_date`, ''%Y-%m'') AS `month`,
        SUM(t1.`quantity`) AS `metric_value`,
        @prev_value AS `prev_value`,
        @prev_value := SUM(t1.`quantity`) AS `curr_value,
        ROUND((SUM(t1.`quantity`) - @prev_value) / @prev_value * 100, 2) AS `growth_rate`
    FROM `t_ai_medical_product_records` t1
    WHERE t1.`is_delete` = 0
        AND t1.`record_date` >= {{start_date}} AND t1.`record_date` <= {{end_date}}
    GROUP BY DATE_FORMAT(t1.`record_date`, ''%Y-%m'')
    ORDER BY `month` ASC
) ranked
LIMIT 100',
  '月度,趋势,month,月份,增长,同比,环比,trend',
  'record_date',
  'quantity',
  'trend',
  NULL,
  1,
  'system'
);

-- SQL 规则初始数据
INSERT INTO sql_rules (rule_code, rule_name, rule_content, rule_type, applies_to, priority, is_active, description) VALUES
('UNION_ORDER_BY', 'UNION 规范', '只在 UNION 总体末尾使用一次 ORDER BY/LIMIT，不要在各分段内部使用', 'constraint', 'all', 10, 1, 'UNION 查询的 ORDER BY 和 LIMIT 只能在最后使用一次'),
('NO_CONSTANT_GROUP_BY', '禁止常量 GROUP BY', '禁止 GROUP BY ''常量字符串''；仅对真实列分组', 'constraint', 'all', 20, 1, 'GROUP BY 必须使用真实列名'),
('PERIOD_FORMAT', 'period 格式', 'period 统一使用 ''YYYYMM'' 字符串，不要混用数字常量', 'constraint', 'all', 30, 1, 'period 字段格式规范'),
('NO_CTE', 'MySQL 5.7 CTE 限制', 'MySQL 5.7 不支持 CTE；在最细粒度事实表先聚合，再关联维表', 'constraint', 'mysql57', 40, 1, 'MySQL 5.7 CTE 限制说明'),
('LIMIT_ROWS', '结果行数限制', '查询结果行数不超过 1000 行，默认不超过 100 行', 'constraint', 'all', 50, 1, '数据量控制规则'),
('OUTER_PARENS', 'UNION 外层括号', '禁止最外层总括号直接接 ORDER BY/LIMIT；如需外层括号须包装派生表', 'constraint', 'all', 15, 1, 'UNION 语法规范');
