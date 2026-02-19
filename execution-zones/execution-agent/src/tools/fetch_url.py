"""
fetch_url tool for Execution Agent.

Fetches text content from a given URL so the model can summarize or reference
external web pages. Includes SSRF prevention (private IP blocking, scheme
validation) and size limits to keep responses within context window bounds.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from strands import tool

_MAX_RETURN_CHARS = 14_000  # Same limit as search_docs
_MAX_DOWNLOAD_BYTES = 512 * 1024  # 512 KB
_TIMEOUT_SECONDS = 10
_USER_AGENT = "SlackAI-ExecutionAgent/1.0"

# Tags to remove from HTML before extracting text
_STRIP_TAGS = {"script", "style", "nav", "header", "footer", "noscript", "iframe"}


def _is_private_ip(hostname: str) -> bool:
    """Resolve hostname and check if any resolved IP is private/reserved."""
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return True  # Cannot resolve → block

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return True
        except ValueError:
            return True  # Unparseable IP → block
    return False


def _extract_text_from_html(html: str) -> str:
    """Strip non-content tags from HTML and return readable text."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(_STRIP_TAGS):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


@tool
def fetch_url(url: str) -> str:
    """指定されたURLのWebページ内容をテキストとして取得します。

    ユーザーがURLを提示した場合や、Webページの要約・参照を求めた場合に
    このツールを呼び出してページの内容を取得してください。

    Args:
        url: 取得したいWebページのURL（http:// または https:// のみ対応）

    Returns:
        ページのテキスト内容。エラー時はエラーメッセージ。
    """
    if not url or not isinstance(url, str) or not url.strip():
        return "URLを指定してください。"

    url = url.strip()

    # Validate scheme
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return f"サポートされていないURLスキームです: {parsed.scheme}。http または https のみ対応しています。"

    hostname = parsed.hostname
    if not hostname:
        return "URLからホスト名を取得できませんでした。有効なURLを指定してください。"

    # SSRF prevention: block private/reserved IPs
    if _is_private_ip(hostname):
        return "プライベートIPアドレスまたは内部ネットワークへのアクセスはブロックされています。"

    # Fetch with streaming to enforce size limit
    try:
        resp = requests.get(
            url,
            timeout=_TIMEOUT_SECONDS,
            headers={"User-Agent": _USER_AGENT},
            allow_redirects=True,
            stream=True,
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        return f"URLへのアクセスがタイムアウトしました（{_TIMEOUT_SECONDS}秒）。"
    except requests.exceptions.ConnectionError:
        return "URLに接続できませんでした。URLが正しいか確認してください。"
    except requests.exceptions.HTTPError as e:
        return f"HTTPエラーが発生しました: ステータスコード {e.response.status_code}"
    except requests.exceptions.RequestException as e:
        return f"リクエストエラー: {e}"

    # Read content with size limit
    chunks = []
    downloaded = 0
    for chunk in resp.iter_content(chunk_size=8192, decode_unicode=False):
        chunks.append(chunk)
        downloaded += len(chunk)
        if downloaded > _MAX_DOWNLOAD_BYTES:
            break
    resp.close()

    raw_bytes = b"".join(chunks)

    # Determine content type
    content_type = resp.headers.get("Content-Type", "").lower()

    if "html" in content_type:
        text = _extract_text_from_html(raw_bytes.decode("utf-8", errors="replace"))
    else:
        text = raw_bytes.decode("utf-8", errors="replace")

    if not text.strip():
        return "ページの内容を取得できましたが、テキストコンテンツが空でした。"

    # Truncate if needed
    if len(text) > _MAX_RETURN_CHARS:
        text = text[:_MAX_RETURN_CHARS] + "\n...(以降省略)"

    return text
