"""
シンプルケース・まもるーの データ分析アプリ

シンプルケースの支援記録データをAI（Claude）で分析し、
ケアの質向上に役立てるStreamlitアプリ。
将来的にまもるーのの睡眠データとの統合分析に対応予定。
"""

import os
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dotenv import load_dotenv

from modules import simple_case_loader as scl
from modules import ai_analyzer
from modules import mamoruno_loader as mml

# 環境変数読み込み
load_dotenv()

# ページ設定
st.set_page_config(
    page_title="ケア記録 AI分析アプリ",
    page_icon="🏥",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ========== スタイル ==========
st.markdown("""
<style>
    .main-title { font-size: 1.8rem; font-weight: bold; color: #1a5276; }
    .section-header { font-size: 1.2rem; font-weight: bold; color: #2874a6; border-bottom: 2px solid #aed6f1; padding-bottom: 4px; margin-top: 1rem; }
    .status-ok { color: #1e8449; font-weight: bold; }
    .status-warn { color: #d35400; font-weight: bold; }
    .analysis-box { background: #f0f8ff; border-left: 4px solid #2874a6; padding: 1rem; border-radius: 4px; }
</style>
""", unsafe_allow_html=True)


# ========== サイドバー ==========
def render_sidebar():
    st.sidebar.markdown("## 設定")

    # APIキー入力
    api_key = st.sidebar.text_input(
        "Anthropic APIキー",
        value=os.getenv("ANTHROPIC_API_KEY", ""),
        type="password",
        help="https://console.anthropic.com/ で取得したAPIキーを入力してください",
    )

    st.sidebar.markdown("---")
    st.sidebar.markdown("### データソース")

    # シンプルケース ファイルアップロード
    st.sidebar.markdown("**シンプルケース**")
    sc_file = st.sidebar.file_uploader(
        "支援記録ファイルをアップロード",
        type=["csv", "xlsx", "xls"],
        key="sc_uploader",
        help="シンプルケースからエクスポートしたCSVまたはExcelファイル",
    )

    st.sidebar.markdown("---")

    # まもるーの 連携状態
    st.sidebar.markdown("**まもるーの（睡眠センサー）**")
    if mml.is_available():
        st.sidebar.success("連携済み")
    else:
        st.sidebar.warning("未連携（準備中）")
        with st.sidebar.expander("詳細"):
            st.caption(mml.get_status_message())

    st.sidebar.markdown("---")
    st.sidebar.caption("ver 1.0.0 | シンプルケース対応版")

    return api_key, sc_file


# ========== データ概要タブ ==========
def render_overview(df: pd.DataFrame, summary: dict):
    st.markdown('<div class="section-header">データ概要</div>', unsafe_allow_html=True)

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("総記録件数", f"{summary['total_records']:,} 件")
    col2.metric("利用者数", f"{len(summary['users'])} 名")
    col3.metric("担当スタッフ数", f"{len(summary['staff'])} 名")
    if summary["date_range"]:
        dr = summary["date_range"]
        col4.metric("記録期間", f"{dr['start']} ~ {dr['end']}")

    # 利用者一覧
    if summary["users"]:
        st.markdown("**利用者一覧**")
        st.write(", ".join([str(u) for u in summary["users"]]))

    # 列情報
    with st.expander("データ列の確認"):
        st.write(summary["columns"])
        st.dataframe(df.head(10), use_container_width=True)


# ========== グラフタブ ==========
def render_charts(df: pd.DataFrame):
    st.markdown('<div class="section-header">データ可視化</div>', unsafe_allow_html=True)

    date_col = next((c for c in df.columns if c in ("date", "日付", "記録日")), None)
    user_col = next((c for c in df.columns if c in ("user_name", "利用者名", "利用者", "氏名")), None)

    # 記録件数の時系列グラフ
    if date_col and pd.api.types.is_datetime64_any_dtype(df[date_col]):
        st.markdown("##### 記録件数の推移")
        daily = df.groupby(df[date_col].dt.date).size().reset_index(name="件数")
        daily.columns = ["日付", "件数"]
        fig = px.bar(daily, x="日付", y="件数", color_discrete_sequence=["#2874a6"])
        fig.update_layout(height=300, margin=dict(t=10, b=10))
        st.plotly_chart(fig, use_container_width=True)

    # 利用者別記録件数
    if user_col:
        st.markdown("##### 利用者別 記録件数")
        user_counts = df[user_col].value_counts().reset_index()
        user_counts.columns = ["利用者", "件数"]
        fig2 = px.bar(
            user_counts,
            x="利用者",
            y="件数",
            color_discrete_sequence=["#1a5276"],
        )
        fig2.update_layout(height=350, margin=dict(t=10, b=10))
        st.plotly_chart(fig2, use_container_width=True)

    # 数値列のヒートマップ（バイタルなど）
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if numeric_cols and date_col:
        st.markdown("##### 数値データの推移")
        selected_col = st.selectbox("表示する項目", numeric_cols)
        if date_col in df.columns:
            fig3 = px.line(
                df.sort_values(date_col),
                x=date_col,
                y=selected_col,
                color=user_col if user_col else None,
                markers=True,
            )
            fig3.update_layout(height=350, margin=dict(t=10, b=10))
            st.plotly_chart(fig3, use_container_width=True)


# ========== AI分析タブ ==========
def render_analysis(df: pd.DataFrame, api_key: str, summary: dict):
    st.markdown('<div class="section-header">AI分析（Claude）</div>', unsafe_allow_html=True)

    if not api_key:
        st.warning("サイドバーにAnthropicのAPIキーを入力してください。")
        return

    col_left, col_right = st.columns([1, 2])

    with col_left:
        # 分析タイプ選択
        analysis_type = st.selectbox(
            "分析タイプ",
            options=["total", "sleep", "health", "behavior", "care_plan"],
            format_func=lambda x: {
                "total": "総合分析",
                "sleep": "睡眠・生活リズム分析",
                "health": "健康・バイタル分析",
                "behavior": "行動・活動分析",
                "care_plan": "個別支援計画への提言",
            }[x],
        )

        # 利用者選択
        user_col = next(
            (c for c in df.columns if c in ("user_name", "利用者名", "利用者", "氏名")), None
        )
        user_options = ["全員"] + [str(u) for u in summary["users"]] if summary["users"] else ["全員"]
        selected_user = st.selectbox("対象利用者", user_options)

        # まもるーのデータ（将来用）
        mamoruno_note = ""
        if mml.is_available():
            mamoruno_note = "（まもるーのデータ連携中）"

        analyze_btn = st.button(f"AI分析を実行 {mamoruno_note}", type="primary", use_container_width=True)

    with col_right:
        if analyze_btn:
            # データ絞り込み
            target_df = df.copy()
            if selected_user != "全員" and user_col:
                target_df = df[df[user_col] == selected_user]

            data_text = scl.prepare_for_analysis(target_df)

            if not data_text.strip():
                st.error("分析対象のデータが見つかりません。")
                return

            with st.spinner("AIが分析中です...（数秒かかります）"):
                try:
                    result = ai_analyzer.analyze_records(
                        data_text=data_text,
                        analysis_type=analysis_type,
                        user_name=selected_user if selected_user != "全員" else None,
                        api_key=api_key,
                    )
                    st.session_state["last_analysis"] = result
                    st.session_state["last_analysis_type"] = analysis_type
                    st.session_state["last_analysis_user"] = selected_user
                except anthropic.AuthenticationError:
                    st.error("APIキーが無効です。正しいAnthropicのAPIキーを入力してください。")
                    return
                except Exception as e:
                    st.error(f"分析中にエラーが発生しました: {e}")
                    return

        # 結果表示
        if "last_analysis" in st.session_state:
            st.markdown(
                f"**分析結果** — {st.session_state['last_analysis_user']} / "
                f"{{'total':'総合','sleep':'睡眠','health':'健康','behavior':'行動','care_plan':'支援計画'}.get(st.session_state['last_analysis_type'], '')}"
            )
            st.markdown(
                f'<div class="analysis-box">{st.session_state["last_analysis"].replace(chr(10), "<br>")}</div>',
                unsafe_allow_html=True,
            )

            # ダウンロードボタン
            st.download_button(
                "分析結果をテキストで保存",
                data=st.session_state["last_analysis"],
                file_name=f"AI分析_{st.session_state['last_analysis_user']}.txt",
                mime="text/plain",
            )


# ========== まもるーの連携タブ ==========
def render_mamoruno():
    st.markdown('<div class="section-header">まもるーの 睡眠データ連携</div>', unsafe_allow_html=True)

    st.info(mml.get_status_message())

    st.markdown("#### 連携後にできること")
    st.markdown("""
- 睡眠センサーデータ（就寝・起床・体動・離床）とケア記録の統合表示
- 睡眠パターンと日中の行動・バイタルの相関分析
- 夜間の状態変化とケアへの影響をAIが自動分析
- 睡眠の質スコアと支援内容の関連性の可視化
""")

    st.markdown("#### 連携手順（実装予定）")
    st.markdown("""
1. まもるーのの管理画面からデータをCSVエクスポート
   または APIキーを取得
2. サイドバーの「まもるーの」欄にファイルをアップロード
   またはAPIキーを入力
3. 自動的にシンプルケースのデータと紐付けて統合分析が実行されます
""")

    # 将来のファイルアップロード UI（非活性で表示）
    st.markdown("#### データアップロード（準備中）")
    st.file_uploader(
        "まもるーのエクスポートファイル（CSV）",
        type=["csv"],
        disabled=True,
        help="まもるーののデータエクスポート機能が利用可能になったら有効になります",
    )


# ========== メイン ==========
def main():
    st.markdown('<div class="main-title">ケア記録 AI分析アプリ</div>', unsafe_allow_html=True)
    st.caption("シンプルケース × まもるーの × Claude AI")
    st.markdown("---")

    api_key, sc_file = render_sidebar()

    if sc_file is None:
        # 初期画面
        st.markdown("### はじめに")
        st.markdown("""
左のサイドバーから操作してください：

1. **Anthropic APIキー** を入力（[取得はこちら](https://console.anthropic.com/)）
2. **シンプルケース** からエクスポートしたCSV/Excelファイルをアップロード
3. 「AI分析」タブで分析タイプと対象利用者を選んで実行

#### このアプリでできること
- シンプルケースの支援記録を自動でAI分析
- 生活リズム・健康・行動パターンの可視化
- ケア改善のための具体的な提言を生成
- 個別支援計画見直しへの活用

#### 将来対応（まもるーの連携）
まもるーの睡眠センサーデータとの統合分析機能を準備中です。
「まもるーの連携」タブで詳細をご確認ください。
""")
        return

    # ファイル読み込み
    try:
        df = scl.load_file(sc_file)
    except ValueError as e:
        st.error(str(e))
        return

    if df is None or df.empty:
        st.error("ファイルを正しく読み込めませんでした。CSV/Excelファイルを確認してください。")
        return

    df = scl.normalize_columns(df)
    df = scl.parse_dates(df)
    summary = scl.get_summary(df)

    st.success(f"ファイル読み込み完了: {summary['total_records']} 件の記録")

    # タブ
    tab1, tab2, tab3, tab4 = st.tabs(["データ概要", "グラフ", "AI分析", "まもるーの連携"])

    with tab1:
        render_overview(df, summary)

    with tab2:
        render_charts(df)

    with tab3:
        render_analysis(df, api_key, summary)

    with tab4:
        render_mamoruno()


if __name__ == "__main__":
    main()
