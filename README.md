# 区间收益分析助手（Interval Analytics）

一个面向基金、A股与指数的开源区间绩效分析工具。输入代码或名称、设置任意日期，即可计算收益与风险指标，构建自定义复合基准，并导出可直接放入 PPT 的高清分析图。

在线体验：[interval-analytics.c15020028216.chatgpt.site](https://interval-analytics.c15020028216.chatgpt.site)

## 功能

- 统一识别基金、股票与指数
- 任意起止日期，以及近1月、3月、6月、今年以来、1年、3年和成立以来快捷区间
- 25项收益、风险与相对基准指标
- 自定义复合基准，例如 `80% 沪深300 + 20% 中债综合指数`
- 基准成分可自由增删、修改类型与权重，权重合计自动校验
- 累计收益与回撤对比图
- CSV明细导出
- 16:9高清PNG导出，自动包含标题、区间、核心指标、基准配比、数据来源与风险提示
- 响应式中文界面

## 指标体系

### 收益指标

区间收益、年化收益、夏普比率、卡玛比率、索提诺比率、日度胜率、月度胜率、最大单日涨幅。

### 风险指标

最大回撤、回撤修复天数、年化波动率、下行波动率、95%单日VaR、95%条件VaR（CVaR）、最大单日跌幅、偏度、峰度。

### 相对基准指标

区间超额收益、年化Alpha、Beta、年化跟踪误差、信息比率、相关系数、上涨捕获率、下跌捕获率。

## 复合基准口径

复合基准不是将不同指数点位直接相加，而是：

1. 分别计算各基准成分的日收益率；
2. 按用户设定权重合成组合日收益；
3. 默认每日按固定权重再平衡；
4. 将组合日收益连乘生成复合基准净值序列。

这使权益指数和债券指数能够在同一收益率维度下组合。

## 数据来源

- 基金净值：天天基金公开净值接口
- 股票与指数：东方财富公开行情接口

本项目不保存用户输入或查询结果。公开数据接口可能因上游规则调整而变化，请在生产使用前确认数据授权、频率限制与服务条款。

## 可选环境变量

基金、股票和指数代码查询无需私有密钥。若需要使用中文名称自动搜索，请复制环境变量示例：

```bash
cp .env.example .env.local
```

然后在 `.env.local` 中设置：

```text
EASTMONEY_SEARCH_TOKEN=你的搜索接口参数
```

该值不会被提交到 Git。请根据数据服务方的授权和使用条款自行配置；不要在公开仓库中硬编码访问参数。

## 技术栈

- React 19
- Next.js 16 / Vinext
- TypeScript
- Tailwind CSS 4
- Cloudflare Worker 兼容运行时
- 原生 SVG 图表与 Canvas PNG 导出

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
git clone https://github.com/maltrehao/interval-analytics.git
cd interval-analytics
npm ci
npm run dev
```

打开终端输出的本地地址即可使用。

## 构建与检查

```bash
npm run lint
npm run build
npm test
```

构建产物位于 `dist/`，包含 Cloudflare Worker 兼容入口。

## 部署

项目源自 ChatGPT Sites 的 Vinext 模板，可以直接部署到兼容 Cloudflare Worker 的平台，也可以在 ChatGPT Work Mode 中通过 Sites 创建项目后导入代码。

`.openai/hosting.json` 仅保留通用绑定声明，不包含原站点的项目标识。自行部署时由目标平台写入对应项目配置。

## 目录结构

```text
app/
  analytics.ts          # 指标与复合基准计算
  api/market/route.ts   # 行情查询与资产识别
  page.tsx              # 交互、图表与导出
  globals.css           # 页面样式
worker/index.ts         # Worker入口
scripts/                # 构建与产物校验
tests/                  # 基础渲染测试
```

## 风险提示

本项目仅用于研究、教学和数据分析，不构成投资建议。指标结果依赖数据质量、时间区间和计算假设，不应作为投资决策的唯一依据。

## 贡献

欢迎提交 Issue 或 Pull Request。提交代码前请确保：

```bash
npm run lint
npm run build
```

## License

[MIT](./LICENSE)
