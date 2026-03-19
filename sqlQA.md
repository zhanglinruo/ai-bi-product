# 统一列规范与生成约束（MySQL 5.7）

- UNION 规范与语法规则
  - 每个 UNION ALL 分段允许小括号，但禁止最外层总括号直接接 `ORDER BY/LIMIT`；如需外层括号须包装派生表：`SELECT * FROM ( ... ) AS u ORDER BY ... LIMIT ...`。
  - 只在 UNION 总体末尾使用一次 `ORDER BY/LIMIT`，不要在各分段内部使用。
  - 禁止 `GROUP BY '常量字符串'`；仅对真实列分组。汇总段通常无需 `GROUP BY`。
  - `period` 统一使用 `'YYYYMM'` 字符串；不要混用数字常量。
  - MySQL 5.7 不支持 CTE；在最细粒度事实表先聚合，再关联维表，避免重复计算与笛卡尔积。

## 药品占有率定义
- **概念**：药品占有率是指某集团或某产品的销量占总销量的比例，反映了该集团或产品在市场中的竞争地位和影响力。
- **业务意义**：分析药品占有率有助于了解市场格局、识别竞争优势、制定市场策略。

## 药品占有率分析SQL示例

Q: 如何查询各省份集团药品占有率？

A: 按省份分析各集团药品的销量和占有率：

```sql
-- 省份维度集团药品占有率分析（优化版）
SELECT 
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
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY t1.`province`, t1.`corporate_group`
        ORDER BY t1.`province`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_province := '') vars
) final
WHERE `corporate_group` LIKE '%莱士集团%'
ORDER BY `province`, `rank`
LIMIT 100;
```

Q: 如何查询各医院药品集团占有率？

A: 按医院分析各集团药品的销量和占有率：

```sql
-- 医院维度集团药品占有率分析（优化版，带排名）
SELECT 
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
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY t1.`hospital_name`, t1.`corporate_group`
        ORDER BY t1.`hospital_name`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_hospital := '') vars
) final
WHERE `corporate_group` LIKE '%莱士集团%'
ORDER BY `hospital_name`, `rank`
LIMIT 100;
```

Q: 如何分析单个药品在各区域的占有率？

A: 按区域分析单个药品的销量和占有率：

```sql
-- 区域维度单个药品占有率分析（优化版，带排名）
SELECT 
    `province`,
    `city`,
    `product_name`,
    `product_quantity`,
    `market_share`,
    `rank`
FROM (
    SELECT 
        `province`,
        `city`,
        `product_name`,
        `product_quantity`,
        `market_share`,
        @rank := IF(@prev_city = `city`, @rank + 1, 1) AS `rank`,
        @prev_city := `city` AS `prev_city`
    FROM (
        SELECT 
            t1.`province`,
            t1.`city`,
            t1.`product_name`,
            SUM(t1.`quantity`) AS `product_quantity`,
            t2.`total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`total_quantity` * 100, 2) AS `market_share`
        FROM `t_ai_medical_product_records` t1
        JOIN (
            SELECT 
                `province`,
                `city`,
                SUM(`quantity`) AS `total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `is_delete` = 0
            GROUP BY `province`, `city`
        ) t2 ON t1.`province` = t2.`province` AND t1.`city` = t2.`city`
        WHERE t1.`is_delete` = 0
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY t1.`province`, t1.`city`, t1.`product_name`
        ORDER BY t1.`province`, t1.`city`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_city := '') vars
) final
ORDER BY `province`, `city`, `rank`
LIMIT 100;
```

Q: 如何分析莱士集团药品的优势和劣势？

A: 分析莱士集团在各省份的占有率情况：

```sql
-- 莱士集团药品占有率分析
SELECT 
    `province`,
    SUM(CASE WHEN `corporate_group` = '莱士集团' THEN `quantity` ELSE 0 END) AS `laishi_quantity`,
    SUM(`quantity`) AS `total_quantity`,
    ROUND(SUM(CASE WHEN `corporate_group` = '莱士集团' THEN `quantity` ELSE 0 END) / SUM(`quantity`) * 100, 2) AS `laishi_market_share`,
    ROUND(AVG(CASE WHEN `corporate_group` = '莱士集团' THEN `quantity` ELSE 0 END) / AVG(`quantity`) * 100, 2) AS `average_market_share`
FROM `t_ai_medical_product_records`
WHERE `is_delete` = 0
    AND `record_date` >= '2024-01-01' AND `record_date` <= '2024-12-31'
GROUP BY `province`
ORDER BY `laishi_market_share` DESC
LIMIT 100;
```

Q: 如何查询销量最高的前10个产品？

A: 按销量降序排列，取前10个产品：

```sql
-- 销量最高的前10个产品
SELECT 
    `product_name`,
    `generic_name`,
    `brand_name`,
    `manufacturer`,
    SUM(`quantity`) AS `total_quantity`
FROM `t_ai_medical_product_records`
WHERE `is_delete` = 0
    AND `record_date` >= '2024-01-01' AND `record_date` <= '2024-12-31'
GROUP BY `product_name`, `generic_name`, `brand_name`, `manufacturer`
ORDER BY `total_quantity` DESC
LIMIT 10;
```

Q: 如何分析莱士集团内部各产品的销量分布？

A: 分析莱士集团内部各产品的销量和占比：

```sql
-- 莱士集团内部产品销量分布（优化版，带排名）
SELECT 
    `product_name`,
    `product_quantity`,
    `laishi_total_quantity`,
    `product_share`,
    `rank`
FROM (
    SELECT 
        `product_name`,
        `product_quantity`,
        `laishi_total_quantity`,
        `product_share`,
        @rank := @rank + 1 AS `rank`
    FROM (
        SELECT 
            t1.`product_name`,
            SUM(t1.`quantity`) AS `product_quantity`,
            t2.`laishi_total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`laishi_total_quantity` * 100, 2) AS `product_share`
        FROM `t_ai_medical_product_records` t1
        CROSS JOIN (
            SELECT 
                SUM(`quantity`) AS `laishi_total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `corporate_group` LIKE '%莱士集团%' AND `is_delete` = 0
        ) t2
        WHERE t1.`is_delete` = 0
            AND t1.`corporate_group` LIKE '%莱士集团%'
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY t1.`product_name`
        ORDER BY `product_quantity` DESC
    ) ranked,
    (SELECT @rank := 0) vars
) final
LIMIT 100;
```

Q: 如何分析各等级医院的药品集团占有率？

A: 按医院等级分析各集团药品的占有率：

```sql
-- 医院等级维度集团药品占有率分析（优化版，带排名）
SELECT 
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
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY t1.`hospital_level`, t1.`corporate_group`
        ORDER BY t1.`hospital_level`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_level := '') vars
) final
WHERE `corporate_group` LIKE '%莱士集团%'
ORDER BY `hospital_level`, `rank`
LIMIT 100;
```

Q: 如何分析药品占有率的月度趋势？

A: 按月份分析药品占有率的变动趋势：

```sql
-- 药品占有率月度趋势分析（优化版，带排名）
SELECT 
    `month`,
    `corporate_group`,
    `group_quantity`,
    `market_share`,
    `rank`
FROM (
    SELECT 
        `month`,
        `corporate_group`,
        `group_quantity`,
        `market_share`,
        @rank := IF(@prev_month = `month`, @rank + 1, 1) AS `rank`,
        @prev_month := `month` AS `prev_month`
    FROM (
        SELECT 
            DATE_FORMAT(t1.`record_date`, '%Y-%m') AS `month`,
            t1.`corporate_group`,
            SUM(t1.`quantity`) AS `group_quantity`,
            t2.`total_quantity`,
            ROUND(SUM(t1.`quantity`) / t2.`total_quantity` * 100, 2) AS `market_share`
        FROM `t_ai_medical_product_records` t1
        JOIN (
            SELECT 
                DATE_FORMAT(`record_date`, '%Y-%m') AS `month`,
                SUM(`quantity`) AS `total_quantity`
            FROM `t_ai_medical_product_records`
            WHERE `is_delete` = 0
            GROUP BY DATE_FORMAT(`record_date`, '%Y-%m')
        ) t2 ON DATE_FORMAT(t1.`record_date`, '%Y-%m') = t2.`month`
        WHERE t1.`is_delete` = 0
            AND t1.`record_date` >= '2024-01-01' AND t1.`record_date` <= '2024-12-31'
        GROUP BY `month`, t1.`corporate_group`
        ORDER BY `month`, `market_share` DESC
    ) ranked,
    (SELECT @rank := 0, @prev_month := '') vars
) final
WHERE `corporate_group` LIKE '%莱士集团%'
ORDER BY `month`, `rank`
LIMIT 100;
```
Q: 如何控制SQL查询的数据量？

TIPS:
1. 使用TOP N限制：ORDER BY和LIMIT子句
2. 聚合优先：使用聚合函数和GROUP BY
3. 时间范围过滤：添加合理的时间范围条件
4. 避免过度UNION：谨慎使用UNION ALL

A: 数据量控制策略：
- 确保整个查询返回的行数理想情况下少于100行，绝对不超过1000行
- 对分组统计查询必须使用ORDER BY ... DESC和LIMIT N子句
- 默认添加合理的时间范围条件（如最近1年、最近季度）