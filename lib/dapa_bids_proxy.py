"""방위사업청 군수품조달 입찰공고 — data.go.kr BidPblancInfoService"""

from __future__ import annotations

import os
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta

BASE_URL = "https://apis.data.go.kr/1690000/BidPblancInfoService/getDmstcCmpetBidPblancList"
D2B_DETAIL_URL = "https://www.d2b.go.kr/pdb/bid/bidDetail.do"

_bids_cache: tuple[float, dict] | None = None
BIDS_CACHE_SEC = 300


def get_data_go_kr_key() -> str:
    return os.environ.get("DATA_GO_KR_SERVICE_KEY", "").strip().strip('"').strip("'")


def _fmt_yyyymmdd(d: date) -> str:
    return d.strftime("%Y%m%d")


def _local_tag(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _text(el: ET.Element | None) -> str:
    if el is None or el.text is None:
        return ""
    return el.text.strip()


def _parse_items(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    result_code = ""
    result_msg = ""

    for el in root.iter():
        tag = _local_tag(el.tag)
        if tag == "resultCode":
            result_code = _text(el)
        elif tag == "resultMsg":
            result_msg = _text(el)

    if result_code and result_code not in {"00", "0"}:
        raise RuntimeError(result_msg or f"API error ({result_code})")

    items: list[dict] = []
    for el in root.iter():
        if _local_tag(el.tag) != "item":
            continue
        row = {_local_tag(child.tag): _text(child) for child in el}
        if row:
            items.append(row)

    return items


def _parse_dt(raw: str) -> datetime | None:
    if not raw:
        return None
    s = re.sub(r"\D", "", raw)
    try:
        if len(s) >= 14:
            return datetime.strptime(s[:14], "%Y%m%d%H%M%S")
        if len(s) >= 8:
            return datetime.strptime(s[:8], "%Y%m%d")
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    return None


def _deadline_label(dt: datetime | None) -> tuple[str, str]:
    if not dt:
        return "—", "open"
    days = int((dt - datetime.now()).total_seconds() // 86400)
    if days < 0:
        return "마감", "closed"
    if days <= 7:
        return f"D-{days}", "urgent"
    return f"D-{days}", "open"


def _bid_url(item: dict) -> str:
    bidno = item.get("g2bPblancNo") or item.get("pblancNo") or ""
    bidseq = item.get("g2bPblancOdr") or item.get("pblancOdr") or "00"
    if bidno:
        qs = urllib.parse.urlencode({"bidno": bidno, "bidseq": bidseq})
        return f"{D2B_DETAIL_URL}?{qs}"
    return "https://www.d2b.go.kr/"


def _map_bid(item: dict, index: int) -> dict:
    close_raw = (
        item.get("biddocPresentnClosDt")
        or item.get("bidPartcptRegistClosDt")
        or item.get("opengDt")
        or ""
    )
    close_dt = _parse_dt(close_raw)
    deadline, status = _deadline_label(close_dt)

    pblanc_no = item.get("pblancNo") or item.get("g2bPblancNo") or f"DAPA-{index + 1}"
    meta_parts = [p for p in [item.get("busiDivs"), item.get("cntrctMth")] if p]
    budget = " · ".join(meta_parts) if meta_parts else "공고문 확인"

    return {
        "id": pblanc_no,
        "title": item.get("bidNm") or "제목 없음",
        "agency": item.get("ornt") or "방위사업청",
        "budget": budget,
        "deadline": deadline,
        "status": status,
        "url": _bid_url(item),
        "pblancDate": item.get("pblancDate") or "",
        "opengDt": item.get("opengDt") or "",
        "closeDt": close_raw,
    }


def _sort_bids(bids: list[dict]) -> list[dict]:
    def sort_key(b: dict) -> tuple:
        close = _parse_dt(b.get("closeDt") or "") or datetime.max
        pub = _parse_dt(b.get("pblancDate") or "") or datetime.min
        urgent = 0 if b.get("status") == "urgent" else 1
        return (urgent, close, -pub.timestamp())

    return sorted(bids, key=sort_key)


def fetch_dapa_bids(
    *,
    page_no: int = 1,
    num_of_rows: int = 10,
    days_back: int = 30,
    http_get_bytes,
) -> dict:
    global _bids_cache

    import time

    now = time.time()
    if _bids_cache and now - _bids_cache[0] < BIDS_CACHE_SEC:
        return _bids_cache[1]

    api_key = get_data_go_kr_key()
    if not api_key:
        raise RuntimeError("DATA_GO_KR_SERVICE_KEY is not configured on the server")

    end = date.today()
    start = end - timedelta(days=max(1, days_back) - 1)

    params = {
        "pageNo": str(page_no),
        "numOfRows": str(min(max(num_of_rows, 1), 100)),
        "anmtDateBegin": _fmt_yyyymmdd(start),
        "anmtDateEnd": _fmt_yyyymmdd(end),
    }
    qs = urllib.parse.urlencode(params)
    url = f"{BASE_URL}?{qs}&serviceKey={api_key}"

    try:
        xml_bytes = http_get_bytes(url, timeout=20)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(raw or f"HTTP {e.code}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed: {e.reason}") from e

    items = _parse_items(xml_bytes)
    bids = _sort_bids([_map_bid(item, i) for i, item in enumerate(items)])

    result = {
        "bids": bids,
        "totalCount": len(bids),
        "source": "dapa",
        "live": True,
        "query": {
            "anmtDateBegin": params["anmtDateBegin"],
            "anmtDateEnd": params["anmtDateEnd"],
        },
    }
    _bids_cache = (now, result)
    return result
