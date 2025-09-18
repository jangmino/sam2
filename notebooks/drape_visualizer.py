from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple, Optional

import gradio as gr
import plotly.graph_objects as go


@dataclass
class DrapeVizState:
    raw: Dict[str, Any] = field(default_factory=dict)
    frames: List[Dict[str, Any]] = field(default_factory=list)
    num_frames: int = 0


class DrapeVizApp:
    """
    두번째 Gradio 앱:
      - 세그멘테이션 결과 JSON을 로드
      - 각 프레임의 "Object 2" → polygons_real_cm (cm 단위)을 폴리라인으로 중첩 표시
      - 좌표계 매핑: 좌상단(-40, 20) ↔︎ 우하단(40, -120)
      - x/y 축과 눈금선 표시
      - 그래프 클릭 시 좌표(cm) 표시
    """

    # 고정 월드 좌표 범위 (요구사항)
    X_MIN, X_MAX = -40.0, 40.0
    Y_TOP, Y_BOTTOM = 10.0, -120.0  # 시각화 상단이 10, 하단이 -120 (y축을 뒤집어 표시)

    def __init__(self, title: str = "Drape Visualization App"):
        self.title = title
        self.state = DrapeVizState()

    # ---------- Core JSON Handling ----------
    def load_json(self, file_obj) -> Tuple[str, int, go.Figure, str]:
        """
        JSON 파일을 읽어 상태에 저장하고, 초기 프레임(0) plot를 생성해 반환.
        Returns: (status_text, num_frames, initial_figure, click_coord_text)
        """
        if file_obj is None:
            return ("No file loaded.", 0, self._empty_figure(), "Click on plot to see (x, y) in cm")

        try:
            with open(file_obj.name, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            return (f"Failed to read JSON: {e}", 0, self._empty_figure(), "Click on plot to see (x, y) in cm")

        frames = data.get("frames", [])
        self.state.raw = data
        self.state.frames = frames
        self.state.num_frames = len(frames)

        if self.state.num_frames == 0:
            return ("JSON loaded, but no frames found.", 0, self._empty_figure(), "Click on plot to see (x, y) in cm")

        fig = self._build_frame_figure(frame_idx=0, show_grid=True)
        status = f"JSON loaded. Frames: {self.state.num_frames}"
        return (status, self.state.num_frames, fig, "Click on plot to see (x, y) in cm")

    # ---------- Figure Builders ----------
    def _empty_figure(self) -> go.Figure:
        fig = go.Figure()
        fig.update_layout(
            title="No data",
            xaxis=dict(range=[self.X_MIN, self.X_MAX], zeroline=True, showgrid=True, dtick=10, mirror=True),
            # y축을 [20, -120]으로 지정하여 시각화 상단(=20)이 실제로 화면 위에 오도록
            yaxis=dict(range=[self.Y_BOTTOM, self.Y_TOP], zeroline=True, showgrid=True, dtick=10, mirror=True),
            width=720,
            height=900,
            margin=dict(l=60, r=20, t=60, b=60),
            clickmode="event+select",
        )
        return fig

    def _build_frame_figure(self, frame_idx: int, show_grid: bool, overlay_all: bool = False) -> go.Figure:
        """
        지정 프레임의 Object 2 → polygons_real_cm를 중첩 라인으로 그림.
        """
        fig = go.Figure()

        # 축/그리드/영역 세팅
        fig.update_xaxes(
            range=[self.X_MIN, self.X_MAX],
            showgrid=show_grid,
            zeroline=True,
            dtick=10,
            mirror=True,
            title_text="x (cm)",
        )
        # y축은 20 (상단) → -120 (하단) 순으로 range를 주어 시각적으로 뒤집음
        fig.update_yaxes(
            range=[self.Y_BOTTOM, self.Y_TOP],
            showgrid=show_grid,
            zeroline=True,
            dtick=10,
            mirror=True,
            title_text="y (cm)",
            scaleanchor=None,  # 정사각 스케일 고정 원치 않으면 None
        )

        fig.update_layout(
            title=f"Frame {frame_idx} — Object 2 polygons_real_cm",
            width=720,
            height=900,
            margin=dict(l=60, r=20, t=60, b=60),
            clickmode="event+select",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        )

        # If requested, overlay all frames' contours. Draw OTHER frames strongly
        # and draw the current frame more faintly so it appears de-emphasized.
        if overlay_all and self.state.num_frames > 0:
            for fi, fr in enumerate(self.state.frames):
                # skip the current frame here; it will be drawn later with a muted style
                if fi == frame_idx:
                    continue

                objs_all = fr.get("objects", {})
                obj2_all = objs_all.get("Object 2", {})
                polys_all: List[List[List[float]]] = obj2_all.get("polygons_real_cm", [])

                for k_all, poly_all in enumerate(polys_all):
                    if not poly_all or len(poly_all) < 2:
                        continue
                    xs_all = [p[0] for p in poly_all]
                    ys_all = [p[1] for p in poly_all]

                    if poly_all[0] != poly_all[-1]:
                        xs_all = xs_all + [xs_all[0]]
                        ys_all = ys_all + [ys_all[0]]

                    # strong/darker traces for other frames to emphasize them
                    fig.add_trace(
                        go.Scatter(
                            x=xs_all,
                            y=ys_all,
                            mode="lines",
                            name=f"frame{fi}_poly_{k_all}",
                            line=dict(width=1, color="rgba(0,50,200,0.55)"),
                            showlegend=False,
                            hoverinfo="skip",
                        )
                    )

        # 데이터가 없을 수 있으니 방어
        if not (0 <= frame_idx < self.state.num_frames):
            return fig

        frame = self.state.frames[frame_idx]
        objects = frame.get("objects", {})
        obj2 = objects.get("Object 2", {})
        polys_cm: List[List[List[float]]] = obj2.get("polygons_real_cm", [])

        # 여러 polygon이 있을 수 있으므로 순회
        for k, poly in enumerate(polys_cm):
            if not poly or len(poly) < 2:
                continue
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]

            # 닫힌 윤곽선을 원하면 시작점을 끝에 추가
            if poly[0] != poly[-1]:
                xs = xs + [xs[0]]
                ys = ys + [ys[0]]

            # If overlay_all is active, render the current frame fainter to
            # de-emphasize it relative to the bold other-frame overlays.
            if overlay_all:
                trace_line = dict(width=2, color="rgba(200,0,0,0.60)")
            else:
                trace_line = dict(width=2, color="crimson")

            fig.add_trace(
                go.Scatter(
                    x=xs,
                    y=ys,
                    mode="lines",
                    name=f"poly_{k}",
                    line=trace_line,
                    hovertemplate="x=%{x:.2f} cm<br>y=%{y:.2f} cm<extra></extra>",
                )
            )

        # 원점이나 기준선(선택사항) 표시를 원하면 아래와 같이 추가 가능:
        # fig.add_hline(y=0, line=dict(width=1, dash="dot"))
        # fig.add_vline(x=0, line=dict(width=1, dash="dot"))

        return fig

    # ---------- Event Handlers ----------
    def on_frame_change(self, frame_idx: int, show_grid: bool, overlay_all: bool = False) -> go.Figure:
        return self._build_frame_figure(frame_idx, show_grid, overlay_all)

    def on_plot_click(self, evt: Optional[dict]) -> str:
        """
        Plotly 클릭 이벤트에서 (x, y) 좌표 추출해 표시.
        Gradio의 select 이벤트로 들어오는 evt 구조를 가정하여 안전하게 파싱.
        """
        if not evt:
            return "Click on plot to see (x, y) in cm"

        # 가능한 키들 탐색 (Gradio/Plotly 버전에 따라 구조가 다를 수 있음)
        # 일반적으로 evt에는 {"points": [{"x": ..., "y": ...}, ...]} 형태가 포함됨
        try:
            points = evt.get("points", [])
            if points and isinstance(points, list):
                x = points[0].get("x", None)
                y = points[0].get("y", None)
                if x is not None and y is not None:
                    return f"(x, y) = ({x:.3f} cm, {y:.3f} cm)"
        except Exception:
            pass

        # fallback: evt 자체를 문자열로
        return f"Clicked: {evt}"

    # ---------- UI ----------
    def build_interface(self) -> gr.Blocks:
        with gr.Blocks(title=self.title) as demo:
            gr.Markdown(f"## {self.title}\n- Load JSON → choose frame → view **Object 2** `polygons_real_cm`\n- Axes in centimeters; top-left = (-40, 20), bottom-right = (40, -120)\n- Click the plot to read coordinates (cm)")

            with gr.Row():
                file_in = gr.File(label="Load result JSON", file_types=[".json"])
                status = gr.Textbox(label="Status", value="No file loaded.", interactive=False)

            with gr.Row():
                frame_slider = gr.Slider(0, 0, value=0, step=1, label="Frame Index", interactive=True)
                show_grid = gr.Checkbox(value=True, label="Show grid")
                overlay_all = gr.Checkbox(value=False, label="Overlay all frames' contours")

            plot = gr.Plot(label="Drape Polygons (cm)")
            clicked = gr.Textbox(label="Last Click (cm)", value="Click on plot to see (x, y) in cm", interactive=False)

            # --- Wire events ---
            # 파일 업로드 시: JSON 로드, 프레임 수 갱신, 초기 플롯 생성
            def _on_file(file_obj):
                st, n_frames, fig, click_text = self.load_json(file_obj)
                # 슬라이더 max/min 업데이트
                slider_update = gr.update(minimum=0, maximum=max(0, n_frames - 1), value=0, interactive=(n_frames > 0))
                return st, slider_update, fig, click_text

            file_in.upload(
                _on_file,
                inputs=[file_in],
                outputs=[status, frame_slider, plot, clicked],
            )

            # 프레임 변경 / 그리드 토글 / 오버레이 토글 시: 그림 갱신
            frame_slider.change(
                self.on_frame_change,
                inputs=[frame_slider, show_grid, overlay_all],
                outputs=[plot],
            )
            show_grid.change(
                self.on_frame_change,
                inputs=[frame_slider, show_grid, overlay_all],
                outputs=[plot],
            )
            overlay_all.change(
                self.on_frame_change,
                inputs=[frame_slider, show_grid, overlay_all],
                outputs=[plot],
            )

            # 플롯 클릭 좌표 표시
            # 일부 Gradio 버전에서는 gr.Plot에 .select가 없고 .click만 있거나 그 반대인 경우가 있어 안전하게 처리
            # 우선 'select' 핸들러를 가져오고 없으면 'click'을 시도합니다. 둘 다 없으면 아무 동작도 하지 않습니다.
            _plot_handler = getattr(plot, "select", None) or getattr(plot, "click", None)
            if _plot_handler is not None:
                _plot_handler(self.on_plot_click, inputs=None, outputs=[clicked])

        return demo

    def launch(self, **kwargs):
        app = self.build_interface()
        app.launch(**kwargs)


if __name__ == "__main__":
    app = DrapeVizApp(title="Drape Visualization App (Object 2 / polygons_real_cm)")
    # 필요 시 share=True 등 옵션 사용 가능
    app.launch()