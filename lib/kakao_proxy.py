"""Kakao OAuth + 카카오톡 나에게 보내기"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = ROOT / ".data" / "kakao-token.json"
KAKAO_AUTH_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"


def get_rest_api_key() -> str:
    return os.environ.get("KAKAO_REST_API_KEY", "").strip().strip('"').strip("'")


def get_client_secret() -> str:
    return os.environ.get("KAKAO_CLIENT_SECRET", "").strip().strip('"').strip("'")


def get_redirect_uri() -> str:
    return os.environ.get("KAKAO_REDIRECT_URI", "").strip().strip('"').strip("'")


def get_public_url() -> str:
    return (
        os.environ.get("DASHBOARD_PUBLIC_URL", "").strip().strip('"').strip("'")
        or "http://localhost:3000"
    )


def _load_token_file() -> dict:
    if not TOKEN_FILE.is_file():
        return {}
    try:
        return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def get_refresh_token() -> str:
    env = os.environ.get("KAKAO_REFRESH_TOKEN", "").strip().strip('"').strip("'")
    if env:
        return env
    return _load_token_file().get("refresh_token", "")


def save_refresh_token(refresh_token: str) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(
        json.dumps({"refresh_token": refresh_token}, ensure_ascii=False),
        encoding="utf-8",
    )


def is_kakao_configured() -> bool:
    return bool(get_rest_api_key() and get_refresh_token())


def build_oauth_login_url() -> str:
    client_id = get_rest_api_key()
    redirect_uri = get_redirect_uri()
    if not client_id or not redirect_uri:
        raise RuntimeError("KAKAO_REST_API_KEY / KAKAO_REDIRECT_URI is not configured")
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "talk_message",
    })
    return f"{KAKAO_AUTH_URL}?{params}"


def _post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            msg = detail.get("error_description") or detail.get("error") or raw
        except json.JSONDecodeError:
            msg = raw or f"HTTP {e.code}"
        raise RuntimeError(str(msg)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Kakao connection failed: {e.reason}") from e


def exchange_code_for_token(code: str) -> dict:
    client_id = get_rest_api_key()
    redirect_uri = get_redirect_uri()
    client_secret = get_client_secret()
    if not client_id or not redirect_uri:
        raise RuntimeError("Kakao app credentials not configured")

    payload = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if client_secret:
        payload["client_secret"] = client_secret
    return _post_form(KAKAO_TOKEN_URL, payload)


def refresh_access_token() -> str:
    refresh_token = get_refresh_token()
    client_id = get_rest_api_key()
    client_secret = get_client_secret()
    if not refresh_token:
        raise RuntimeError("KAKAO_REFRESH_TOKEN not set — /api/kakao/oauth/login 먼저 실행")
    if not client_id:
        raise RuntimeError("KAKAO_REST_API_KEY not configured")

    payload = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }
    if client_secret:
        payload["client_secret"] = client_secret

    data = _post_form(KAKAO_TOKEN_URL, payload)
    access = data.get("access_token")
    if not access:
        raise RuntimeError("Kakao access_token missing")
    if data.get("refresh_token"):
        save_refresh_token(data["refresh_token"])
    return access


def send_memo_template(template: dict) -> dict:
    access_token = refresh_access_token()

    body = urllib.parse.urlencode({
        "template_object": json.dumps(template, ensure_ascii=False),
    }).encode("utf-8")

    req = urllib.request.Request(
        KAKAO_MEMO_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            msg = detail.get("msg") or detail.get("message") or raw
        except json.JSONDecodeError:
            msg = raw or f"HTTP {e.code}"
        raise RuntimeError(str(msg)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Kakao send failed: {e.reason}") from e


def send_memo_text(text: str, web_url: str | None = None) -> dict:
    link_url = web_url or get_public_url()

    template = {
        "object_type": "text",
        "text": text[:200],
        "link": {
            "web_url": link_url,
            "mobile_web_url": link_url,
        },
        "button_title": "대시보드 열기",
    }
    return send_memo_template(template)
