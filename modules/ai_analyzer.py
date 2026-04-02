"""
AI分析モジュール

Claude APIを使って支援記録データを分析し、
ケアへの具体的な提言を生成する。
"""

import anthropic
import pandas as pd
from typing import Optional


SYSTEM_PROMPT = """あなたは障害福祉・介護の専門的な知識を持つAIアシスタントです。
支援記録データを分析し、利用者のQOL向上や支援の質の改善に役立つ洞察を提供します。

分析の際は以下の観点を重視してください：
- 利用者の状態変化のパターンと傾向
- 睡眠・食事・活動・排泄などの生活リズム
- 支援の効果と課題
- リスクの早期発見（バイタル異常、行動変化など）
- 個別支援計画への反映ポイント

回答は具体的かつ実用的で、現場スタッフが即座に活用できる内容にしてください。
専門用語は適切に使用しつつ、わかりやすい表現を心がけてください。"""


def analyze_records(
    data_text: str,
    analysis_type: str = "total",
    user_name: Optional[str] = None,
    api_key: str = "",
    mamoruno_data: Optional[str] = None,
) -> str:
    """
    支援記録データをAIで分析する。

    Args:
        data_text: 分析対象のテキストデータ
        analysis_type: 分析タイプ
            - "total"     : 総合分析
            - "sleep"     : 睡眠・生活リズム分析
            - "health"    : 健康・バイタル分析
            - "behavior"  : 行動・活動分析
            - "care_plan" : 個別支援計画への提言
        user_name: 分析対象の利用者名（特定の場合）
        api_key: Anthropic APIキー
        mamoruno_data: まもるーの睡眠データ（連携時に使用）

    Returns:
        AI分析結果テキスト
    """
    client = anthropic.Anthropic(api_key=api_key)

    user_scope = f"利用者「{user_name}」の" if user_name else "全利用者の"

    prompts = {
        "total": f"""以下は{user_scope}支援記録データです。
総合的に分析し、以下の項目についてまとめてください：

1. **全体的な状態の傾向と変化**
2. **生活リズム（睡眠・食事・排泄・活動）のパターン**
3. **気になる点・リスク要因**
4. **支援の効果が見られる点**
5. **ケア改善のための具体的な提言（優先度順）**

---
{data_text}""",

        "sleep": f"""以下は{user_scope}支援記録データです。
睡眠・生活リズムに焦点を当てて分析してください：

1. **睡眠パターンの傾向**（就寝・起床時間、睡眠時間の変化）
2. **睡眠の質に影響を与えている可能性のある要因**
3. **日中活動との関連性**
4. **改善のための支援提言**

---
{data_text}
{f"【まもるーの睡眠センサーデータ】{chr(10)}{mamoruno_data}" if mamoruno_data else ""}""",

        "health": f"""以下は{user_scope}支援記録データです。
健康・バイタル面に焦点を当てて分析してください：

1. **バイタルサイン（体温・血圧・脈拍）の傾向と異常値**
2. **食事・水分摂取の状況**
3. **排泄の状況と変化**
4. **健康上の注意点と早期対応が必要な事項**
5. **医療・看護連携が必要な場合の提言**

---
{data_text}""",

        "behavior": f"""以下は{user_scope}支援記録データです。
行動・活動面に焦点を当てて分析してください：

1. **日中活動のパターンと参加状況**
2. **行動上の変化や特徴的な傾向**
3. **コミュニケーション・社会参加の状況**
4. **環境や支援方法との関連性**
5. **活動参加促進のための提言**

---
{data_text}""",

        "care_plan": f"""以下は{user_scope}支援記録データです。
個別支援計画の見直しに向けた分析をしてください：

1. **現在の支援計画で達成されている目標**
2. **課題として残っている点**
3. **新たに設定すべき支援目標の提案**
4. **支援方法・アプローチの改善提案**
5. **短期目標・長期目標への反映ポイント**

---
{data_text}""",
    }

    prompt = prompts.get(analysis_type, prompts["total"])

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text


def generate_individual_report(
    df: pd.DataFrame,
    user_name: str,
    api_key: str,
    mamoruno_data: Optional[str] = None,
) -> str:
    """
    特定の利用者の個別レポートを生成する。
    """
    from modules.simple_case_loader import prepare_for_analysis

    # 利用者でフィルタリング
    user_col = next(
        (c for c in df.columns if c in ("user_name", "利用者名", "利用者", "氏名")), None
    )
    if user_col:
        user_df = df[df[user_col] == user_name]
    else:
        user_df = df

    data_text = prepare_for_analysis(user_df)
    return analyze_records(
        data_text,
        analysis_type="total",
        user_name=user_name,
        api_key=api_key,
        mamoruno_data=mamoruno_data,
    )
