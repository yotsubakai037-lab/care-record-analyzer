"""
シンプルケース データ読み込みモジュール

シンプルケースからエクスポートされたCSV/Excelファイルを読み込み、
分析用のデータフレームに変換する。
"""

import pandas as pd
import io
from typing import Optional


# シンプルケースの標準列名マッピング
# 実際のエクスポートファイルに合わせて調整してください
COLUMN_MAPPING = {
    # CSVの列名: 内部標準名
    "利用者名": "user_name",
    "利用者": "user_name",
    "氏名": "user_name",
    "日付": "date",
    "記録日": "date",
    "支援内容": "support_content",
    "記録内容": "support_content",
    "内容": "support_content",
    "担当者": "staff_name",
    "支援者": "staff_name",
    "記録者": "staff_name",
    "バイタル": "vitals",
    "体温": "temperature",
    "血圧": "blood_pressure",
    "脈拍": "pulse",
    "食事": "meal",
    "食事量": "meal_amount",
    "朝食": "breakfast",
    "昼食": "lunch",
    "夕食": "dinner",
    "排泄": "excretion",
    "睡眠": "sleep",
    "睡眠時間": "sleep_hours",
    "就寝時間": "sleep_time",
    "起床時間": "wake_time",
    "活動": "activity",
    "特記事項": "notes",
    "備考": "notes",
    "評価": "assessment",
    "カテゴリ": "category",
    "サービス種別": "service_type",
}


def load_file(uploaded_file) -> Optional[pd.DataFrame]:
    """
    アップロードされたファイル(CSV/Excel)を読み込む。

    Args:
        uploaded_file: StreamlitのUploadedFileオブジェクト

    Returns:
        読み込んだDataFrame、失敗時はNone
    """
    try:
        filename = uploaded_file.name.lower()
        if filename.endswith(".csv"):
            # 文字コードを自動判定（Shift-JIS / UTF-8）
            raw = uploaded_file.read()
            for encoding in ["utf-8-sig", "shift_jis", "cp932", "utf-8"]:
                try:
                    df = pd.read_csv(io.BytesIO(raw), encoding=encoding)
                    break
                except (UnicodeDecodeError, Exception):
                    continue
            else:
                return None
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(uploaded_file)
        else:
            return None

        return df
    except Exception as e:
        raise ValueError(f"ファイル読み込みエラー: {e}")


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    列名を標準名に変換する。
    マッピングにない列はそのまま保持する。
    """
    rename_map = {}
    for col in df.columns:
        col_str = str(col).strip()
        if col_str in COLUMN_MAPPING:
            rename_map[col] = COLUMN_MAPPING[col_str]
    return df.rename(columns=rename_map)


def parse_dates(df: pd.DataFrame) -> pd.DataFrame:
    """日付列を datetime 型に変換する。"""
    date_cols = [c for c in df.columns if c in ("date", "日付", "記録日")]
    for col in date_cols:
        try:
            df[col] = pd.to_datetime(df[col], errors="coerce")
        except Exception:
            pass
    return df


def get_summary(df: pd.DataFrame) -> dict:
    """
    データの基本サマリーを返す。
    """
    summary = {
        "total_records": len(df),
        "columns": list(df.columns),
        "date_range": None,
        "users": [],
        "staff": [],
    }

    # 日付範囲
    date_col = next((c for c in df.columns if c in ("date", "日付", "記録日")), None)
    if date_col and pd.api.types.is_datetime64_any_dtype(df[date_col]):
        valid = df[date_col].dropna()
        if not valid.empty:
            summary["date_range"] = {
                "start": valid.min().strftime("%Y-%m-%d"),
                "end": valid.max().strftime("%Y-%m-%d"),
            }

    # 利用者一覧
    user_col = next(
        (c for c in df.columns if c in ("user_name", "利用者名", "利用者", "氏名")), None
    )
    if user_col:
        summary["users"] = df[user_col].dropna().unique().tolist()

    # 担当者一覧
    staff_col = next(
        (c for c in df.columns if c in ("staff_name", "担当者", "支援者", "記録者")), None
    )
    if staff_col:
        summary["staff"] = df[staff_col].dropna().unique().tolist()

    return summary


def prepare_for_analysis(df: pd.DataFrame) -> str:
    """
    AI分析用にデータをテキスト形式に整形する。
    大量データの場合は最新200件に絞る。
    """
    target = df.tail(200) if len(df) > 200 else df

    lines = []
    for _, row in target.iterrows():
        parts = []
        for col, val in row.items():
            if pd.notna(val) and str(val).strip():
                parts.append(f"{col}: {val}")
        if parts:
            lines.append(" | ".join(parts))

    return "\n".join(lines)
