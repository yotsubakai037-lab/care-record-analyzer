'use strict';

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// GitHub Models エンドポイント
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';
const GITHUB_MODEL = 'gpt-4o';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `あなたは障害福祉・介護の専門的な知識を持つAIアシスタントです。
支援記録データを分析し、利用者のQOL向上や支援の質の改善に役立つ洞察を提供します。

分析の際は以下の観点を重視してください：
- 利用者の状態変化のパターンと傾向
- 睡眠・食事・活動・排泄などの生活リズム
- 支援の効果と課題
- リスクの早期発見（バイタル異常、行動変化など）
- 個別支援計画への反映ポイント

回答は具体的かつ実用的で、現場スタッフが即座に活用できる内容にしてください。`;

function buildDataSection(dataText, talknoteText) {
  const parts = [];
  if (dataText)     parts.push(`【シンプルケース 支援記録】\n${dataText}`);
  if (talknoteText) parts.push(`【Talknote 投稿記録】\n${talknoteText}`);
  return parts.join('\n\n');
}

const PROMPTS = {
  total: (scope, data) => `以下は${scope}記録データです。総合的に分析し、以下の項目についてまとめてください：

1. **全体的な状態の傾向と変化**
2. **生活リズム（睡眠・食事・排泄・活動）のパターン**
3. **気になる点・リスク要因**
4. **支援の効果が見られる点**
5. **ケア改善のための具体的な提言（優先度順）**

---
${data}`,

  sleep: (scope, data) => `以下は${scope}記録データです。睡眠・生活リズムに焦点を当てて分析してください：

1. **睡眠パターンの傾向**（就寝・起床時間、睡眠時間の変化）
2. **睡眠の質に影響を与えている可能性のある要因**
3. **日中活動との関連性**
4. **改善のための支援提言**

---
${data}`,

  health: (scope, data) => `以下は${scope}記録データです。健康・バイタル面に焦点を当てて分析してください：

1. **バイタルサイン（体温・血圧・脈拍）の傾向と異常値**
2. **食事・水分摂取の状況**
3. **排泄の状況と変化**
4. **健康上の注意点と早期対応が必要な事項**
5. **医療・看護連携が必要な場合の提言**

---
${data}`,

  behavior: (scope, data) => `以下は${scope}記録データです。行動・活動面に焦点を当てて分析してください：

1. **日中活動のパターンと参加状況**
2. **行動上の変化や特徴的な傾向**
3. **コミュニケーション・社会参加の状況**
4. **環境や支援方法との関連性**
5. **活動参加促進のための提言**

---
${data}`,

  care_plan: (scope, data) => `以下は${scope}記録データです。個別支援計画の見直しに向けた分析をしてください：

1. **現在の支援計画で達成されている目標**
2. **課題として残っている点**
3. **新たに設定すべき支援目標の提案**
4. **支援方法・アプローチの改善提案**
5. **短期目標・長期目標への反映ポイント**

---
${data}`,
};

async function analyzeWithGitHub({ prompt, apiKey }) {
  const client = new OpenAI({
    baseURL: GITHUB_MODELS_ENDPOINT,
    apiKey,
  });

  const response = await client.chat.completions.create({
    model: GITHUB_MODEL,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
  });

  return response.choices[0].message.content;
}

async function analyzeWithClaude({ prompt, apiKey }) {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

async function analyze({ dataText, talknoteText, analysisType = 'total', userName, apiKey }) {
  const scope = userName ? `利用者「${userName}」の` : '全利用者の';
  const builder = PROMPTS[analysisType] || PROMPTS.total;
  const combinedData = buildDataSection(dataText, talknoteText);
  const prompt = builder(scope, combinedData);

  // APIキーの種別で振り分け
  if (apiKey.startsWith('sk-ant-')) {
    return await analyzeWithClaude({ prompt, apiKey });
  } else {
    return await analyzeWithGitHub({ prompt, apiKey });
  }
}

module.exports = { analyze };
