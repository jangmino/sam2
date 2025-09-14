# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

import ast
import math
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional

import av
from app_conf import FFMPEG_NUM_THREADS
from dataclasses_json import dataclass_json

TRANSCODE_VERSION = 1


def _pick_working_encoder(preferred: Optional[str] = None) -> str:
    """Return a video encoder name that exists in the local ffmpeg build.
    Tries `preferred` first (if given), then env `VIDEO_ENCODE_CODEC`, then fallbacks.
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg binary not found. Please install ffmpeg and ensure it's on PATH.")

    # Query encoders list
    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            check=False,
            capture_output=True,
            text=True,
        )
        enc_list = (proc.stdout or "") + (proc.stderr or "")
        enc_list = enc_list.lower()
    except Exception as e:
        # If listing encoders fails, fall back to preferred/env directly
        enc_list = ""

    # Build candidate list (dedup, keep order)
    candidates = []
    for name in [preferred, os.environ.get("VIDEO_ENCODE_CODEC"), "libx264", "h264_videotoolbox", "mpeg4", "libx265", "hevc_videotoolbox"]:
        if name and name not in candidates:
            candidates.append(name)

    # If we could list encoders, choose the first that appears in the list
    for name in candidates:
        if enc_list and name.lower() in enc_list:
            return name

    # If listing failed, try preferred/env first anyway
    for name in candidates:
        if name:
            return name

    raise RuntimeError("No suitable ffmpeg encoder found or specified.")


@dataclass_json
@dataclass
class VideoMetadata:
    duration_sec: Optional[float]
    video_duration_sec: Optional[float]
    container_duration_sec: Optional[float]
    fps: Optional[float]
    width: Optional[int]
    height: Optional[int]
    num_video_frames: int
    num_video_streams: int
    video_start_time: float


def transcode(
    in_path: str,
    out_path: str,
    in_metadata: Optional[VideoMetadata],
    seek_t: float,
    duration_time_sec: float,
):
    codec = os.environ.get("VIDEO_ENCODE_CODEC", "libx264")
    crf = int(os.environ.get("VIDEO_ENCODE_CRF", "23"))
    fps = int(os.environ.get("VIDEO_ENCODE_FPS", "24"))
    max_w = int(os.environ.get("VIDEO_ENCODE_MAX_WIDTH", "1280"))
    max_h = int(os.environ.get("VIDEO_ENCODE_MAX_HEIGHT", "720"))
    verbose = ast.literal_eval(os.environ.get("VIDEO_ENCODE_VERBOSE", "False"))

    normalize_video(
        in_path=in_path,
        out_path=out_path,
        max_w=max_w,
        max_h=max_h,
        seek_t=seek_t,
        max_time=duration_time_sec,
        in_metadata=in_metadata,
        codec=codec,
        crf=crf,
        fps=fps,
        verbose=verbose,
    )


def get_video_metadata(path: str) -> VideoMetadata:
    with av.open(path) as cont:
        num_video_streams = len(cont.streams.video)
        width, height, fps = None, None, None
        video_duration_sec = 0
        container_duration_sec = float((cont.duration or 0) / av.time_base)
        video_start_time = 0.0
        rotation_deg = 0
        num_video_frames = 0
        if num_video_streams > 0:
            video_stream = cont.streams.video[0]
            assert video_stream.time_base is not None

            # Derive rotation in a way that's compatible with older PyAV builds (no `side_data`).
            # Many FFmpeg builds expose rotation via stream metadata key 'rotate'.
            # If absent, assume 0.
            rotation_deg = 0
            try:
                rotate_str = (getattr(video_stream, "metadata", None) or {}).get("rotate", "0")
                rotation_deg = int(rotate_str)
            except Exception:
                rotation_deg = 0

            num_video_frames = video_stream.frames
            video_start_time = float(video_stream.start_time * video_stream.time_base)
            width, height = video_stream.width, video_stream.height

            # Safely compute fps: prefer guessed_rate, then average_rate, else None
            fps = None
            try:
                if video_stream.guessed_rate:
                    fps = float(video_stream.guessed_rate)
            except Exception:
                fps = None
            fps_avg = getattr(video_stream, "average_rate", None)

            if video_stream.duration is not None:
                video_duration_sec = float(video_stream.duration * video_stream.time_base)

            if fps is None and fps_avg is not None:
                try:
                    fps = float(fps_avg)
                except Exception:
                    fps = None

            # If rotation is 90/270 degrees, swap width/height
            if isinstance(rotation_deg, (int, float)) and int(rotation_deg) in (90, -90, 270, -270):
                width, height = height, width

        duration_sec = max(container_duration_sec, video_duration_sec)

        return VideoMetadata(
            duration_sec=duration_sec,
            container_duration_sec=container_duration_sec,
            video_duration_sec=video_duration_sec,
            video_start_time=video_start_time,
            fps=fps,
            width=width,
            height=height,
            num_video_streams=num_video_streams,
            num_video_frames=num_video_frames,
        )


def normalize_video(
    in_path: str,
    out_path: str,
    max_w: int,
    max_h: int,
    seek_t: float,
    max_time: float,
    in_metadata: Optional[VideoMetadata],
    codec: str = "libx264",
    crf: int = 23,
    fps: int = 24,
    verbose: bool = False,
):
    if in_metadata is None:
        in_metadata = get_video_metadata(in_path)

    assert in_metadata.num_video_streams > 0, "no video stream present"

    w, h = in_metadata.width, in_metadata.height
    assert w is not None, "width not available"
    assert h is not None, "height not available"

    # rescale to max_w:max_h if needed & preserve aspect ratio
    # Keep original size if already within bounds (e.g., 720x1280 portrait)
    orig_w, orig_h = w, h
    r = w / h
    if (w <= max_w) and (h <= max_h):
        # No scaling necessary
        pass
    else:
        if r < 1:
            # portrait: limit by height
            h = min(max_h, h)
            w = h * r
        else:
            # landscape: limit by width
            w = min(max_w, w)
            h = w / r

    # h264 cannot encode w/ odd dimensions
    w = max(2, int(round(w)))
    h = max(2, int(round(h)))
    if w % 2 != 0:
        w += 1
    if h % 2 != 0:
        h += 1

    # Determine if we need a scale filter (avoid if same as source)
    need_scale = not (w == max(2, (orig_w // 2) * 2) and h == max(2, (orig_h // 2) * 2))

    # Ensure output directory exists
    out_dir = os.path.dirname(out_path) or "."
    os.makedirs(out_dir, exist_ok=True)

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg binary not found. Please install ffmpeg and ensure it's on PATH."
        )

    # Pick a working encoder for this ffmpeg build
    codec = _pick_working_encoder(codec)

    log_args = [] if verbose else ["-hide_banner", "-loglevel", "error"]

    cmd = [
        ffmpeg,
        "-y",  # overwrite output
        "-nostdin",
        *log_args,
        "-threads",
        f"{FFMPEG_NUM_THREADS}",  # global threads
        "-ss",
        f"{seek_t:.2f}",
        "-t",
        f"{max_time:.2f}",
        "-i",
        in_path,
        "-threads",
        f"{FFMPEG_NUM_THREADS}",  # decode (or filter..?) threads
        "-vf",
        ",".join([
            *( [f"fps={fps}"] if fps else [] ),
            *( [f"scale={w}:{h}"] if need_scale else [] ),
            "setsar=1:1",
        ]),
        "-c:v",
        codec,
        "-crf",
        f"{crf}",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        f"{FFMPEG_NUM_THREADS}",  # encode threads
        out_path,
    ]

    if verbose:
        print(" ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=not verbose,
            text=True,
        )
    except FileNotFoundError as e:
        raise RuntimeError(f"Failed to execute ffmpeg command: {e}")

    if result.returncode != 0 or not os.path.exists(out_path):
        err_snippet = (result.stderr or "").strip() if not verbose else ""
        raise RuntimeError(
            "ffmpeg failed to produce output. "
            f"Return code: {result.returncode}. "
            f"Encoder: {codec}. "
            f"Output path: {out_path}. "
            f"Error: {err_snippet[:500]}"
        )
