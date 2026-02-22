"""
generate_chart_image tool for Execution Agent (027-slack-file-generation-best-practices).

Produces chart images (.png) and stores them in tool_context.invocation_state
for the handler to extract and build file_artifact.
"""

from io import BytesIO
from typing import Any, List

from strands import tool

import file_config as fc
from file_config import sanitize_filename

_PNG_MIME = "image/png"
_VALID_CHART_TYPES = ("bar", "line", "pie", "scatter")


@tool(context=True)
def generate_chart_image(
    filename: str,
    chart_type: str,
    title: str,
    data: dict,
    tool_context: Any,
    x_label: str = "",
    y_label: str = "",
) -> str:
    """チャート画像 (.png) を生成します。

    棒グラフ、折れ線グラフ、円グラフ、散布図に対応。

    Args:
        filename: ファイル名（拡張子不要、自動付加）
        chart_type: チャートの種類 (bar, line, pie, scatter)
        title: チャートタイトル
        data: labels と datasets を持つオブジェクト
        tool_context: Strands framework context (injected). Contains invocation_state.
        x_label: X軸ラベル（オプション）
        y_label: Y軸ラベル（オプション）

    Returns:
        モデルに返す説明文（日本語）。ファイルは invocation_state に格納される。
    """
    if not filename or not isinstance(filename, str) or not filename.strip():
        return "エラー: filename を指定してください。"
    if not chart_type or chart_type not in _VALID_CHART_TYPES:
        return f"エラー: chart_type は bar, line, pie, scatter のいずれかを指定してください。"
    if not data or not isinstance(data, dict):
        return "エラー: data は labels と datasets を持つオブジェクトを指定してください。"

    labels = data.get("labels")
    datasets = data.get("datasets")
    if not isinstance(labels, list):
        labels = []
    if not isinstance(datasets, list):
        datasets = []

    if not labels and not datasets:
        return "エラー: data.labels と data.datasets を指定してください。"

    safe_filename = sanitize_filename(filename.strip(), "png")
    if not safe_filename or "." not in safe_filename:
        safe_filename = f"{safe_filename}.png"

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        return "エラー: matplotlib がインストールされていません。"

    fig, ax = plt.subplots(figsize=(8, 5))

    if chart_type == "bar":
        x = np.arange(len(labels)) if labels else np.arange(len(datasets[0]["values"]) if datasets else 0)
        width = 0.8 / max(1, len(datasets))
        for i, ds in enumerate(datasets):
            vals = ds.get("values") or []
            lbl = ds.get("label") or f"Dataset {i + 1}"
            off = (i - len(datasets) / 2 + 0.5) * width
            ax.bar(x + off, vals, width, label=lbl)
        ax.set_xticks(x)
        ax.set_xticklabels(labels or [str(i) for i in range(len(x))])
        ax.legend()

    elif chart_type == "line":
        x = np.arange(len(labels)) if labels else np.arange(
            max(len(ds.get("values") or []) for ds in datasets) if datasets else 0
        )
        for i, ds in enumerate(datasets):
            vals = ds.get("values") or []
            lbl = ds.get("label") or f"Dataset {i + 1}"
            ax.plot(x[: len(vals)], vals, label=lbl, marker="o", markersize=4)
        ax.set_xticks(x[: len(labels)])
        ax.set_xticklabels(labels or [str(i) for i in range(len(x))])
        ax.legend()

    elif chart_type == "pie":
        vals = datasets[0].get("values") if datasets else []
        sizes = [float(v) if v is not None else 0 for v in vals]
        lbls = labels if labels and len(labels) == len(sizes) else [str(i) for i in range(len(sizes))]
        if not sizes:
            sizes = [1]
            lbls = ["(no data)"]
        ax.pie(sizes, labels=lbls, autopct="%1.1f%%", startangle=90)

    elif chart_type == "scatter":
        for i, ds in enumerate(datasets):
            vals = ds.get("values") or []
            lbl = ds.get("label") or f"Dataset {i + 1}"
            x_vals = np.arange(len(vals))
            ax.scatter(x_vals, vals, label=lbl, alpha=0.7)
        ax.legend()

    ax.set_title(title or "Chart")
    if x_label:
        ax.set_xlabel(x_label)
    if y_label:
        ax.set_ylabel(y_label)

    plt.tight_layout()
    buf = BytesIO()
    plt.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    file_bytes = buf.getvalue()

    if len(file_bytes) > fc.MAX_IMAGE_FILE_BYTES:
        return (
            f"エラー: ファイルサイズが上限（{fc.MAX_IMAGE_FILE_BYTES} バイト）を超えています。"
            f"現在 {len(file_bytes)} バイトです。"
        )

    invocation_state = getattr(tool_context, "invocation_state", {})
    if isinstance(invocation_state, dict):
        invocation_state["generated_file"] = {
            "file_bytes": file_bytes,
            "file_name": safe_filename,
            "mime_type": _PNG_MIME,
            "description": f"チャート画像「{safe_filename}」を生成しました。",
        }

    return f"ファイル「{safe_filename}」を作成しました。Slack にアップロードされます。"
