"""prompt/ 폴더의 마크다운 프롬프트 로더"""

from __future__ import annotations

import re
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompt"
KNOWN_PROMPTS = ("defense-analysis",)

_cache: dict[str, str] = {}


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            return text[end + 3 :].strip()
    return text.strip()


def load_prompt(name: str) -> str:
    if name in _cache:
        return _cache[name]

    path = PROMPT_DIR / f"{name}.md"
    if not path.is_file():
        raise FileNotFoundError(f"Prompt not found: {path}")

    raw = path.read_text(encoding="utf-8")
    _cache[name] = _strip_frontmatter(raw)
    return _cache[name]


def render_prompt(name: str, **variables: str) -> str:
    template = load_prompt(name)
    result = template
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    unresolved = re.findall(r"\{\{([A-Z_]+)\}\}", result)
    if unresolved:
        missing = ", ".join(sorted(set(unresolved)))
        raise ValueError(f"Prompt '{name}' has unresolved placeholders: {missing}")
    return result.strip()


def load_all_prompts() -> None:
    for name in KNOWN_PROMPTS:
        load_prompt(name)
