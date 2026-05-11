"""
Shotstack render helper.

This module powers the FastAPI Shotstack endpoints and remains usable as a
tiny CLI for dry-building edits during local verification.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import certifi
import shotstack_sdk as shotstack
from shotstack_sdk.api import edit_api, serve_api
from shotstack_sdk.model.clip import Clip
from shotstack_sdk.model.edit import Edit
from shotstack_sdk.model.image_asset import ImageAsset
from shotstack_sdk.model.output import Output
from shotstack_sdk.model.soundtrack import Soundtrack
from shotstack_sdk.model.timeline import Timeline
from shotstack_sdk.model.track import Track
from shotstack_sdk.model.transition import Transition
from shotstack_sdk.model.video_asset import VideoAsset

PROJECT_ROOT = Path(__file__).resolve().parent.parent

RESOLUTION_ALIASES = {
    "preview": "preview",
    "mobile": "mobile",
    "sd": "sd",
    "576p": "sd",
    "hd": "hd",
    "720p": "hd",
    "1280 x 720 (720p)": "hd",
    "1080": "1080",
    "1080p": "1080",
    "fhd": "1080",
    "full hd": "1080",
    "1920 x 1080 (1080p)": "1080",
    "4k": "4k",
    "3840 x 2160 (4k)": "4k",
}

QUALITY_VALUES = {"low", "medium", "high", "veryhigh"}
FPS_VALUES = {12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60}
IN_PROGRESS_STATUSES = {"queued", "fetching", "preprocessing", "rendering", "saving"}


class ShotstackHelperError(Exception):
    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.status = status


def load_env() -> None:
    env_file = PROJECT_ROOT / ".env.local"
    if not env_file.exists():
        return

    for line in env_file.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def to_plain(value: Any) -> Any:
    if hasattr(value, "to_dict"):
        return to_plain(value.to_dict())
    if isinstance(value, dict):
        return {key: to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_plain(item) for item in value]
    return value


def finite_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number or number in (float("inf"), float("-inf")):
        return fallback
    return number


def positive_float(value: Any, fallback: float) -> float:
    number = finite_float(value, fallback)
    return number if number > 0 else fallback


def clean_url(value: Any) -> str:
    url = str(value or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ShotstackHelperError("Shotstack assets must use public HTTP(S) URLs.", 400)
    return url


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def normalize_resolution(value: Any) -> str:
    normalized = str(value or "1080").strip().lower()
    return RESOLUTION_ALIASES.get(normalized, "1080")


def normalize_quality(value: Any) -> str:
    normalized = str(value or "medium").strip().lower()
    return normalized if normalized in QUALITY_VALUES else "medium"


def normalize_fps(value: Any) -> float:
    fps = finite_float(value, 25.0)
    return float(fps if fps in FPS_VALUES else 25)


def normalize_aspect_ratio(value: Any) -> str:
    normalized = str(value or "16:9").strip()
    return normalized if normalized in {"16:9", "9:16", "1:1", "4:5", "4:3"} else "16:9"


def normalize_effect(value: Any) -> str | None:
    effect = str(value or "").strip()
    allowed = Clip.allowed_values.get(("effect",), {}).values()
    if effect in allowed:
        return effect
    return None


def normalize_transition(value: Any) -> str | None:
    transition = str(value or "").strip()
    allowed = Transition.allowed_values.get(("_in",), {}).values()
    return transition if transition in allowed else None


def build_visual_clip(
    raw_clip: dict[str, Any],
    *,
    allow_effects: bool = False,
    allow_transitions: bool = False,
) -> Clip:
    source_url = clean_url(raw_clip.get("sourceUrl"))
    source_type = str(raw_clip.get("sourceType") or "video").lower()
    start = max(0.0, finite_float(raw_clip.get("start"), 0.0))
    length = max(0.1, positive_float(raw_clip.get("length"), 4.0))
    trim = max(0.0, finite_float(raw_clip.get("trim"), 0.0))

    transition_in = normalize_transition(raw_clip.get("transitionIn")) if allow_transitions else None
    transition_out = normalize_transition(raw_clip.get("transitionOut")) if allow_transitions else None
    transition = None
    if transition_in or transition_out:
        kwargs: dict[str, str] = {}
        if transition_in:
            kwargs["_in"] = transition_in
        if transition_out:
            kwargs["out"] = transition_out
        transition = Transition(**kwargs)

    clip_kwargs: dict[str, Any] = {
        "start": float(round(start, 3)),
        "length": float(round(length, 3)),
        "fit": "crop",
    }
    if transition:
        clip_kwargs["transition"] = transition

    if source_type == "image":
        clip_kwargs["asset"] = ImageAsset(src=source_url)
        effect = normalize_effect(raw_clip.get("effect")) if allow_effects else None
        if effect:
            clip_kwargs["effect"] = effect
        return Clip(**clip_kwargs)

    clip_kwargs["asset"] = VideoAsset(
        src=source_url,
        trim=float(round(trim, 3)),
        volume=0.0,
        transcode=True,
    )
    return Clip(**clip_kwargs)


def build_edit(payload: dict[str, Any]) -> Edit:
    raw_clips = payload.get("clips")
    if not isinstance(raw_clips, list) or not raw_clips:
        raise ShotstackHelperError("Add at least one video or image clip before exporting.", 400)

    allow_effects = truthy(payload.get("allowEffects"))
    allow_transitions = truthy(payload.get("allowTransitions"))
    visual_clips = [
        build_visual_clip(
            item,
            allow_effects=allow_effects,
            allow_transitions=allow_transitions,
        )
        for item in raw_clips
    ]
    tracks = [Track(clips=visual_clips)]

    audio_url = str(payload.get("audioUrl") or "").strip()
    soundtrack = None
    if audio_url:
        soundtrack = Soundtrack(
            src=clean_url(audio_url),
            effect="fadeInFadeOut",
            volume=1.0,
        )

    timeline_kwargs: dict[str, Any] = {
        "background": "#000000",
        "tracks": tracks,
        "cache": True,
    }
    if soundtrack:
        timeline_kwargs["soundtrack"] = soundtrack

    timeline = Timeline(**timeline_kwargs)

    output = Output(
        format="mp4",
        resolution=normalize_resolution(payload.get("resolution")),
        aspect_ratio=normalize_aspect_ratio(payload.get("aspectRatio")),
        fps=normalize_fps(payload.get("fps")),
        quality=normalize_quality(payload.get("quality")),
        mute=False,
    )

    return Edit(timeline=timeline, output=output)


def configuration() -> shotstack.Configuration:
    load_env()
    api_key = (
        os.environ.get("SHOTSTACK_API_KEY")
        or os.environ.get("SHOTSTACK_SANDBOX_API_KEY")
        or os.environ.get("SHOTSTACK_KEY")
    )
    if not api_key:
        raise ShotstackHelperError("SHOTSTACK_API_KEY is not configured.", 500)

    env_name = os.environ.get("SHOTSTACK_ENV", "stage").strip().strip("/")
    host = os.environ.get("SHOTSTACK_HOST") or f"https://api.shotstack.io/{env_name}"
    config = shotstack.Configuration(host=host)
    config.ssl_ca_cert = certifi.where()
    config.api_key["DeveloperKey"] = api_key
    return config


def render(payload: dict[str, Any]) -> dict[str, Any]:
    edit = build_edit(payload)
    with shotstack.ApiClient(configuration()) as api_client:
        api_instance = edit_api.EditApi(api_client)
        response = to_plain(api_instance.post_render(edit))
        render_response = response.get("response", {})
        return {
            "success": bool(response.get("success", True)),
            "message": response.get("message") or render_response.get("message"),
            "renderId": render_response.get("id"),
            "status": render_response.get("status") or "queued",
            "response": render_response,
        }


def hosted_asset_for_render(api_client: shotstack.ApiClient, render_id: str) -> dict[str, Any] | None:
    try:
        response = to_plain(serve_api.ServeApi(api_client).get_asset_by_render_id(render_id))
    except Exception:
        return None

    data = response.get("data")
    items = data if isinstance(data, list) else [data]
    for item in items:
        attributes = (item or {}).get("attributes") or {}
        if attributes.get("status") == "ready" and attributes.get("url"):
            return attributes
    return None


def raw_render_status(api_client: shotstack.ApiClient, render_id: str) -> dict[str, Any]:
    api_client.call_api(
        "/render/{id}",
        "GET",
        path_params={"id": render_id},
        query_params=[("data", "false"), ("merged", "false")],
        auth_settings=["DeveloperKey"],
        response_type=None,
        _return_http_data_only=False,
        collection_formats={},
    )

    raw_response = api_client.last_response
    data = raw_response.data
    if isinstance(data, bytes):
        data = data.decode("utf-8")

    try:
        return json.loads(data or "{}")
    except json.JSONDecodeError as exc:
        raise ShotstackHelperError("Shotstack returned a non-JSON status response.", raw_response.status) from exc


def status(payload: dict[str, Any]) -> dict[str, Any]:
    render_id = str(payload.get("renderId") or payload.get("id") or "").strip()
    if not render_id:
        raise ShotstackHelperError("Missing Shotstack render id.", 400)

    with shotstack.ApiClient(configuration()) as api_client:
        response = raw_render_status(api_client, render_id)
        render_response = response.get("response", {})
        render_status = render_response.get("status")
        hosted_asset = None
        if render_status == "done":
            hosted_asset = hosted_asset_for_render(api_client, render_id)

        return {
            "success": bool(response.get("success", True)),
            "renderId": render_response.get("id") or render_id,
            "status": render_status,
            "url": render_response.get("url"),
            "hostedUrl": hosted_asset.get("url") if hosted_asset else None,
            "asset": hosted_asset,
            "message": response.get("message"),
            "isComplete": render_status == "done",
            "isWorking": render_status in IN_PROGRESS_STATUSES,
            "response": render_response,
        }


def build(payload: dict[str, Any]) -> dict[str, Any]:
    return {"success": True, "edit": to_plain(build_edit(payload))}


def run(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    actions = {
        "build": build,
        "render": render,
        "status": status,
    }
    if action not in actions:
        raise ShotstackHelperError(f"Unsupported Shotstack action: {action}", 400)
    return actions[action](payload)


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "build"
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = run(action, payload)
        print(json.dumps(result))
        return 0
    except ShotstackHelperError as error:
        print(json.dumps({"success": False, "error": str(error), "status": error.status}))
        return 1
    except Exception as error:
        print(json.dumps({"success": False, "error": str(error), "status": 500}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
