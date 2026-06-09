"""
pose_test.py — 고양이/강아지 전용 포즈 추정 + 자세 분류

변경사항 (기존 스쿼트 카운터 → 동물 포즈):
  - YOLOv8n detection으로 고양이/강아지만 필터링 (사람 제외)
  - CSRT 트래커로 깜빡임 방지
  - 키포인트 기반 자세 분류 (눕기/앉기/서기/걷기/스트레칭)
  - 활동량 측정 + UI 패널
"""

import cv2
import numpy as np
import time
import os
from collections import deque
from datetime import datetime
from ultralytics import YOLO

# ── 모델 로드 ──────────────────────────────────────────────────
det_model  = YOLO("yolov8n.pt")        # 고양이/강아지 감지용
pose_model = YOLO("yolov8n-pose.pt")   # 키포인트 추출용

# COCO 클래스 ID
PET_CLASSES = {15: "Cat", 16: "Dog"}

# ── 스켈레톤 연결 (yolov8n-pose 17 키포인트 기준) ───────────────
# 동물에 완전히 맞진 않지만 몸통/사지 구조는 유사하게 동작
SKELETON = [
    (0,1),(1,2),(2,3),(3,4),          # 머리→몸통
    (5,6),(6,7),(11,12),(12,13),      # 왼쪽 앞/뒷다리
    (8,9),(9,10),(14,15),(15,16),     # 오른쪽 앞/뒷다리
    (5,11),(6,12),(8,14),(9,15),      # 몸통 연결
]

# 키포인트 색상 (부위별)
KP_COLOR = [
    (100,220,100),(100,220,100),       # 0,1  머리
    (255,180, 50),(255,180, 50),(255,180,50), # 2,3,4 몸통
    ( 80,180,255),( 80,180,255),( 80,180,255), # 5,6,7  앞왼발
    ( 80,180,255),( 80,180,255),( 80,180,255), # 8,9,10 앞오른발
    (220, 80,220),(220, 80,220),(220, 80,220), # 11,12,13 뒷왼발
    (220, 80,220),(220, 80,220),(220, 80,220), # 14,15,16 뒷오른발
]

# ── 자세 분류 ──────────────────────────────────────────────────
def classify_pose(kpts, frame_h):
    """
    키포인트 (N,3) 배열로 자세 분류.
    반환: (pose_str, confidence)
    """
    valid = [(kpts[i][0], kpts[i][1])
             for i in range(len(kpts)) if kpts[i][2] > 0.4]

    if len(valid) < 4:
        return "Unknown", 0.0

    xs = [p[0] for p in valid]
    ys = [p[1] for p in valid]
    body_w  = max(xs) - min(xs)
    body_h  = max(ys) - min(ys)
    aspect  = body_w / (body_h + 1e-5)   # 가로:세로 비율

    # 발목 y좌표 분산 (발이 펴져있는지)
    ankle_idx = [7, 10, 13, 16]
    ankle_ys  = [kpts[i][1] for i in ankle_idx
                 if i < len(kpts) and kpts[i][2] > 0.4]
    ankle_spread = (max(ankle_ys) - min(ankle_ys)) / (frame_h + 1e-5) \
                   if len(ankle_ys) >= 2 else 0.0

    # 뒷다리 무릎 굽힘 (11-12-13 각도)
    def angle(a_idx, b_idx, c_idx):
        if any(kpts[i][2] < 0.4 for i in [a_idx, b_idx, c_idx]):
            return 180.0
        a = np.array(kpts[a_idx][:2])
        b = np.array(kpts[b_idx][:2])
        c = np.array(kpts[c_idx][:2])
        v1, v2 = a - b, c - b
        cos = np.dot(v1,v2) / (np.linalg.norm(v1)*np.linalg.norm(v2)+1e-5)
        return float(np.degrees(np.arccos(np.clip(cos,-1,1))))

    hl_bend = angle(11, 12, 13)   # 뒷왼다리 굽힘각

    # 앞뒤 발목 수평 거리 (스트레칭)
    front_xs = [kpts[i][0] for i in [7,10]  if i < len(kpts) and kpts[i][2]>0.4]
    back_xs  = [kpts[i][0] for i in [13,16] if i < len(kpts) and kpts[i][2]>0.4]
    spread_x = abs(np.mean(front_xs) - np.mean(back_xs)) / (body_w+1e-5) \
               if front_xs and back_xs else 0.0

    # ── 판정 ──
    if aspect > 1.6 and ankle_spread < 0.12:
        return "Lying down",        0.85
    if spread_x > 1.2:
        return "Stretching",        0.80
    if hl_bend < 100 and aspect < 1.2:
        return "Sitting",           0.82
    if ankle_spread > 0.15:
        return "Walking / Running", 0.75
    if aspect < 1.5:
        return "Standing",          0.75
    return "Active", 0.60

# ── 활동량 측정 ────────────────────────────────────────────────
movement_history = deque(maxlen=30)
prev_kpts = None

def calc_activity(kpts):
    global prev_kpts
    if kpts is None or prev_kpts is None:
        prev_kpts = kpts
        return 0.0, "Measuring..."

    dists = []
    for i in range(min(len(kpts), len(prev_kpts))):
        if kpts[i][2] > 0.4 and prev_kpts[i][2] > 0.4:
            dx = kpts[i][0] - prev_kpts[i][0]
            dy = kpts[i][1] - prev_kpts[i][1]
            dists.append(np.sqrt(dx**2 + dy**2))

    movement = float(np.mean(dists)) if dists else 0.0
    movement_history.append(movement)
    prev_kpts = kpts

    level = min(1.0, movement / 50.0)
    avg   = np.mean(movement_history)
    trend = ("Very calm" if avg < 2 else
             "Calm"      if avg < 8 else
             "Active"    if avg < 20 else "Very active")
    return level, trend

# ── UI 그리기 ─────────────────────────────────────────────────
POSE_COLOR = {
    "Lying down":        (100, 200, 100),
    "Sitting":           (100, 180, 255),
    "Standing":          (255, 200,  80),
    "Walking / Running": ( 80,  80, 220),
    "Stretching":        (200, 100, 255),
    "Active":            (200, 200, 200),
    "Unknown":           (120, 120, 120),
}

def draw_skeleton(frame, kpts):
    for i, j in SKELETON:
        if i >= len(kpts) or j >= len(kpts):
            continue
        if kpts[i][2] < 0.4 or kpts[j][2] < 0.4:
            continue
        cv2.line(frame,
                 (int(kpts[i][0]), int(kpts[i][1])),
                 (int(kpts[j][0]), int(kpts[j][1])),
                 (200, 200, 200), 1, cv2.LINE_AA)

def draw_keypoints(frame, kpts):
    for idx, (x, y, c) in enumerate(kpts):
        if c < 0.4:
            continue
        color = KP_COLOR[idx] if idx < len(KP_COLOR) else (200,200,200)
        cv2.circle(frame, (int(x), int(y)), 5, color, -1, cv2.LINE_AA)
        cv2.circle(frame, (int(x), int(y)), 5, (255,255,255), 1, cv2.LINE_AA)

def draw_panel(frame, species, pose, conf, act_level, act_trend):
    h, w = frame.shape[:2]
    px, py, pw, ph = w-225, 10, 215, 175

    # 반투명 패널
    overlay = frame.copy()
    cv2.rectangle(overlay, (px,py), (px+pw, py+ph), (20,20,20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
    cv2.rectangle(frame, (px,py), (px+pw, py+ph), (80,80,80), 1)

    color = POSE_COLOR.get(pose, (200,200,200))
    bar_w = pw - 16

    # 종
    cv2.putText(frame, f"[{species.upper()}]" if species else "[Detecting...]",
                (px+8, py+22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160,160,160), 1)
    # 자세
    cv2.putText(frame, pose,
                (px+8, py+48), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
    # 신뢰도 바
    cv2.rectangle(frame, (px+8, py+58), (px+8+bar_w, py+68), (50,50,50), -1)
    cv2.rectangle(frame, (px+8, py+58), (px+8+int(bar_w*conf), py+68), color, -1)
    cv2.putText(frame, f"conf {conf:.0%}",
                (px+8, py+82), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (140,140,140), 1)

    # 활동량
    cv2.putText(frame, f"Activity: {act_trend}",
                (px+8, py+102), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (180,180,180), 1)
    act_color = ((100,200,100) if act_level < 0.3 else
                 (100,180,255) if act_level < 0.7 else (80,80,220))
    cv2.rectangle(frame, (px+8, py+110), (px+8+bar_w, py+120), (50,50,50), -1)
    cv2.rectangle(frame, (px+8, py+110), (px+8+int(bar_w*act_level), py+120), act_color, -1)

    # 범례
    legend = [("Head",(100,220,100)), ("Body",(255,180,50)),
              ("Front",(80,180,255)), ("Back",(220,80,220))]
    lx = px + 8
    for label, lc in legend:
        cv2.circle(frame, (lx+4, py+138), 4, lc, -1)
        cv2.putText(frame, label, (lx+11, py+142),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (160,160,160), 1)
        lx += 54

# ── 알림 시스템 ───────────────────────────────────────────────
# 나중에 웹 alert 연동 시 send_alert() 함수만 교체하면 됨

ALERT_COLORS = {
    "FALL"    : (0,   0,  220),   # 빨강 — 낙상
    "ABNORMAL": (0,  140, 255),   # 주황 — 비정상 행동
    "NO_MOTION": (0, 200, 255),   # 노랑 — 무움직임
    "INTRUDER": (220,  0, 220),   # 보라 — 침입자
}

ALERT_COOLDOWN = 10   # 같은 알림 재발생 방지 시간(초)

class AlertSystem:
    """
    4가지 상황 감지 + UI 알림 패널 표시
    나중에 send_alert()에 웹소켓/이메일/카카오 연동 가능
    """
    def __init__(self):
        # 알림 히스토리 (최대 5개 화면 표시)
        self.alerts       = deque(maxlen=5)
        self.last_fired   = {}     # {alert_type: last_time}

        # 낙상 감지용
        self.bbox_y_history  = deque(maxlen=30)   # bbox 중심 y 히스토리
        self.no_motion_start = None               # 무움직임 시작 시각

        # 비정상 행동 감지용
        self.position_history = deque(maxlen=90)  # 위치 히스토리 (6초)
        self.pose_history     = deque(maxlen=45)  # 자세 히스토리 (3초)

        # 외출 모드
        self.away_mode = False

    # ── 외부에서 매 프레임 호출 ──────────────────────────────

    def update(self, frame, track_bbox, current_kpts,
               pose_str, act_level, det_results_raw):
        """
        매 프레임 호출 — 4가지 상황 체크
        det_results_raw: YOLO detection 결과 (침입자 감지용)
        """
        now = time.time()
        h, w = frame.shape[:2]

        # 현재 중심점
        cx, cy = None, None
        if track_bbox:
            x, y, bw, bh = [int(v) for v in track_bbox]
            cx = x + bw // 2
            cy = y + bh // 2

        # ① 낙상 감지
        self._check_fall(now, cy, act_level)

        # ② 비정상 행동
        self._check_abnormal(now, cx, cy, pose_str)

        # ③ 장시간 무움직임
        self._check_no_motion(now, act_level)

        # ④ 침입자 감지 (외출 모드일 때만)
        if self.away_mode:
            self._check_intruder(now, det_results_raw)

    # ── 상황별 감지 로직 ─────────────────────────────────────

    def _check_fall(self, now, cy, act_level):
        """
        낙상: bbox 중심 y가 짧은 시간에 급격히 아래로 이동
              + 이후 일정 시간 움직임 없음
        """
        if cy is None:
            return
        self.bbox_y_history.append((now, cy))

        if len(self.bbox_y_history) < 10:
            return

        # 최근 0.5초 내 y 변화량
        recent = [(t, y) for t, y in self.bbox_y_history if now - t < 0.5]
        if len(recent) < 3:
            return

        y_drop = recent[-1][1] - recent[0][1]   # 양수 = 아래로 이동

        # y가 빠르게 아래로 + 이후 정지
        if y_drop > 60 and act_level < 0.1:
            self._fire("FALL", "Fall detected! Pet may be injured.")

    def _check_abnormal(self, now, cx, cy, pose_str):
        """
        비정상 행동:
          - 배회: 같은 구역을 반복 왕복
          - 반복 자세: 같은 자세가 비정상적으로 반복
        """
        if cx is None or cy is None:
            return

        self.position_history.append((cx, cy))
        self.pose_history.append(pose_str)

        if len(self.position_history) < 60:
            return

        # 배회 감지: 위치 표준편차가 낮은데 이동은 계속 (맴돌기)
        pts  = np.array(self.position_history)
        std  = np.std(pts, axis=0).mean()
        span = np.ptp(pts, axis=0).mean()   # 최대-최소 범위

        # 좁은 범위에서 계속 움직임 = 배회
        if std < 30 and span > 20 and span < 100:
            self._fire("ABNORMAL", "Abnormal behavior: pacing detected.")

        # 반복 자세: 최근 3초 자세가 2가지 이하로 반복
        unique_poses = set(self.pose_history)
        if len(unique_poses) <= 2 and "Unknown" not in unique_poses:
            counts = {p: list(self.pose_history).count(p) for p in unique_poses}
            dominant = max(counts.values())
            if dominant > 35:   # 45프레임 중 35번 이상 같은 자세
                self._fire("ABNORMAL", f"Repetitive behavior: {max(counts, key=counts.get)}")

    def _check_no_motion(self, now, act_level):
        """
        장시간 무움직임: 활동량이 낮은 상태가 일정 시간 지속
        """
        NO_MOTION_SEC = 30   # 임계값 (테스트용 30초, 실제 300초)

        if act_level < 0.05:
            if self.no_motion_start is None:
                self.no_motion_start = now
            elif now - self.no_motion_start >= NO_MOTION_SEC:
                elapsed = int(now - self.no_motion_start)
                self._fire("NO_MOTION",
                           f"No motion for {elapsed}s. Check your pet!")
        else:
            self.no_motion_start = None   # 움직임 재개 → 초기화

    def _check_intruder(self, now, det_results_raw):
        """
        침입자: 외출 모드에서 사람(class 0) 감지 시 알림
        """
        if det_results_raw is None:
            return
        for box in det_results_raw.boxes:
            if int(box.cls[0]) == 0 and float(box.conf[0]) > 0.5:
                self._fire("INTRUDER", "Intruder detected! Human in frame.")
                break

    # ── 알림 발송 ────────────────────────────────────────────

    def _fire(self, alert_type: str, message: str):
        """쿨다운 체크 후 알림 등록. 여기에 웹/이메일 연동 추가 가능."""
        now = time.time()
        last = self.last_fired.get(alert_type, 0)
        if now - last < ALERT_COOLDOWN:
            return   # 쿨다운 중

        self.last_fired[alert_type] = now
        ts = datetime.now().strftime("%H:%M:%S")
        self.alerts.appendleft({
            "type"   : alert_type,
            "message": message,
            "time"   : ts,
            "age"    : now,
        })
        print(f"\n[ALERT][{alert_type}] {ts} — {message}")

        # ── 웹 연동 포인트 ──────────────────────────────────
        # 나중에 여기에 추가:
        # send_to_web(alert_type, message)      # 웹소켓
        # send_email(alert_type, message)        # 이메일
        # send_kakao(alert_type, message)        # 카카오

    # ── UI 알림 패널 그리기 ──────────────────────────────────

    def draw_alerts(self, frame):
        h, w = frame.shape[:2]
        now  = time.time()

        # 외출 모드 표시
        if self.away_mode:
            cv2.rectangle(frame, (0, 0), (w, 22), (60, 0, 60), -1)
            cv2.putText(frame, "AWAY MODE — Intruder detection ON",
                        (8, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 100, 220), 1)

        # 알림 패널 (좌측 하단)
        panel_y = h - 20
        for i, alert in enumerate(self.alerts):
            age     = now - alert["age"]
            if age > 30:   # 30초 지난 알림은 흐리게
                alpha = max(0.3, 1.0 - (age - 30) / 30)
            else:
                alpha = 1.0

            color   = ALERT_COLORS.get(alert["type"], (200, 200, 200))
            faded   = tuple(int(c * alpha) for c in color)
            text    = f"[{alert['time']}] {alert['message']}"

            # 배경
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(frame,
                          (8, panel_y - th - 4),
                          (14 + tw, panel_y + 2),
                          (20, 20, 20), -1)
            cv2.putText(frame, text,
                        (10, panel_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, faded, 1)
            panel_y -= (th + 8)

        # 최신 알림 강조 (화면 중앙 상단 — 5초간)
        if self.alerts:
            latest = self.alerts[0]
            if now - latest["age"] < 5:
                color  = ALERT_COLORS.get(latest["type"], (200,200,200))
                banner = f"! {latest['type']}: {latest['message']}"
                cv2.rectangle(frame, (0, 55), (w, 80), (20,20,20), -1)
                cv2.putText(frame, banner,
                            (10, 73), cv2.FONT_HERSHEY_SIMPLEX,
                            0.52, color, 1)

    def toggle_away_mode(self):
        self.away_mode = not self.away_mode
        status = "ON" if self.away_mode else "OFF"
        print(f"[Away Mode] {status}")

alert_system = AlertSystem()

# ── 클립 저장 ─────────────────────────────────────────────────
CLIP_DIR   = "clips"
MAX_SEC    = 60                        # 최대 녹화 시간 (초)
FPS        = 15
os.makedirs(CLIP_DIR, exist_ok=True)

# 원본 프레임 링버퍼 (UI 없는 클린 프레임, 최대 1분)
pre_buffer = deque(maxlen=MAX_SEC * FPS)

class ManualRecorder:
    """S키로 녹화 시작/종료 — 원본 프레임만 저장"""

    def __init__(self):
        self.recording    = False
        self.rec_frames   = []         # 녹화 중 프레임 누적
        self.start_time   = None
        self.current_file = ""

    def toggle(self, w: int, h: int):
        """S키 누를 때마다 호출 — 시작/종료 토글"""
        if not self.recording:
            self._start(w, h)
        else:
            self._stop()

    def _start(self, w: int, h: int):
        self.rec_frames  = []
        self.start_time  = time.time()
        self.recording   = True
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_file = os.path.join(CLIP_DIR, f"clip_{ts}.mp4")
        print(f"\n[Rec] 녹화 시작 → {self.current_file}")

    def _stop(self):
        if not self.rec_frames:
            self.recording = False
            return

        h, w  = self.rec_frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(self.current_file, fourcc, FPS, (w, h))
        for f in self.rec_frames:
            writer.write(f)
        writer.release()

        duration = len(self.rec_frames) / FPS
        print(f"[Rec] 저장 완료: {self.current_file}  ({duration:.1f}초)")
        self.recording  = False
        self.rec_frames = []

    def write(self, raw_frame: np.ndarray):
        """매 프레임 — 녹화 중이면 원본 프레임 누적"""
        if not self.recording:
            return
        self.rec_frames.append(raw_frame.copy())

    def check_auto_stop(self):
        """메인 루프에서 매 프레임 호출 — 1분 초과 시 자동 저장"""
        if self.recording and time.time() - self.start_time >= MAX_SEC:
            print(f"\n[Rec] 최대 {MAX_SEC}초 도달 — 자동 저장")
            self._stop()

    def elapsed(self) -> float:
        if not self.recording or self.start_time is None:
            return 0.0
        return time.time() - self.start_time

recorder = ManualRecorder()

# ── 메인 루프 ─────────────────────────────────────────────────
VIDEO_PATH = "Emergency_test_video.mp4"   # 분석할 영상 파일명
cap = cv2.VideoCapture(VIDEO_PATH)
FPS = int(cap.get(cv2.CAP_PROP_FPS)) or 15   # 영상 FPS 자동 읽기

# CSRT 트래커 (깜빡임 방지)
tracker       = None
tracking      = False
track_bbox    = None
last_det_time = 0
DET_INTERVAL  = 1.0   # YOLO detection 주기 (초)

current_species  = ""
current_kpts     = None
current_pose     = ("Unknown", 0.0)
prev_time        = time.time()
det_results_raw  = None   # 침입자 감지용 YOLO 결과 보관

print("Pet Pose Estimator 실행 중.")
print("Q=종료 / S=녹화 / R=ROI선택 / A=외출모드토글")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # frame = cv2.flip(frame, 1)
    h, w  = frame.shape[:2]
    now   = time.time()

    # ── 원본 프레임 보존 (UI 그리기 전) ──────────────────────
    raw_frame = frame.copy()
    pre_buffer.append(raw_frame)
    recorder.write(raw_frame)
    recorder.check_auto_stop()         # 1분 초과 체크

    # ── 1) YOLO detection (주기적) ────────────────────────────
    if now - last_det_time >= DET_INTERVAL:
        last_det_time = now
        det_results = det_model(frame, verbose=False, conf=0.4)[0]

        best_conf, best_box, best_species = 0, None, ""
        for box in det_results.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in PET_CLASSES:
                continue
            c = float(box.conf[0])
            if c > best_conf:
                best_conf    = c
                best_species = PET_CLASSES[cls_id]
                x1,y1,x2,y2 = map(int, box.xyxy[0])
                best_box = (x1, y1, x2-x1, y2-y1)

        if best_box:
            current_species = best_species
            track_bbox = best_box
            tracker = cv2.TrackerCSRT_create()
            tracker.init(frame, best_box)
            tracking = True
        det_results_raw = det_results   # 침입자 감지용 보관

    # ── 2) CSRT 트래커 업데이트 (매 프레임) ──────────────────
    if tracking and tracker:
        ok, track_bbox = tracker.update(frame)
        if not ok:
            tracking   = False
            track_bbox = None

    # ── 3) 포즈 추정 ─────────────────────────────────────────
    if track_bbox:
        x, y, bw, bh = [int(v) for v in track_bbox]
        # 패딩 추가
        pad = int(max(bw, bh) * 0.2)
        x1c = max(0, x-pad);  y1c = max(0, y-pad)
        x2c = min(w, x+bw+pad); y2c = min(h, y+bh+pad)
        crop = frame[y1c:y2c, x1c:x2c]

        if crop.size > 0:
            pose_results = pose_model(crop, verbose=False)[0]
            if (pose_results.keypoints is not None and
                    len(pose_results.keypoints.data) > 0):
                kpts_raw = pose_results.keypoints.data[0].cpu().numpy()
                # crop 좌표 → 원본 좌표
                kpts_raw[:, 0] += x1c
                kpts_raw[:, 1] += y1c
                current_kpts = kpts_raw
                current_pose = classify_pose(current_kpts, h)

        # bbox 시각화
        cv2.rectangle(frame, (x,y), (x+bw, y+bh), (80,200,80), 1)

    # ── 4) 스켈레톤 + 키포인트 그리기 ────────────────────────
    if current_kpts is not None:
        draw_skeleton(frame, current_kpts)
        draw_keypoints(frame, current_kpts)

    # ── 5) 활동량 ────────────────────────────────────────────
    act_level, act_trend = calc_activity(current_kpts)

    # ── 6) 알림 시스템 업데이트 ──────────────────────────────
    pose_str, pose_conf = current_pose
    alert_system.update(frame, track_bbox, current_kpts,
                        pose_str, act_level, det_results_raw)

    # ── 7) UI 패널 ───────────────────────────────────────────
    pose_str, pose_conf = current_pose
    draw_panel(frame, current_species, pose_str, pose_conf, act_level, act_trend)
    alert_system.draw_alerts(frame)

    # FPS
    fps = 1.0 / (now - prev_time + 1e-5)
    prev_time = now
    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160,160,160), 1)

    # 녹화 상태 표시
    if recorder.recording:
        elapsed = recorder.elapsed()
        remain  = MAX_SEC - elapsed
        # 빨간 점 + REC + 경과/남은 시간
        cv2.circle(frame, (15, 48), 6, (0, 0, 220), -1)
        cv2.putText(frame, f"REC  {elapsed:.0f}s  (max {remain:.0f}s left)  S = Stop & Save",
                    (28, 53), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 220), 1)
    else:
        cv2.putText(frame, "S = Start Rec  |  R = ROI  |  Q = Quit",
                    (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140,140,140), 1)

    cv2.imshow("Pet Pose Estimator", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q') or key == 27:
        break
    elif key == ord('r'):
        roi = cv2.selectROI("Select pet (ENTER confirm)", frame, False)
        cv2.destroyWindow("Select pet (ENTER confirm)")
        if roi[2] > 0 and roi[3] > 0:
            track_bbox = roi
            tracker = cv2.TrackerCSRT_create()
            tracker.init(frame, roi)
            tracking = True
            current_species = "Pet (manual)"
    elif key == ord('s'):
        recorder.toggle(w, h)
    elif key == ord('a'):
        alert_system.toggle_away_mode()

cap.release()
cv2.destroyAllWindows()
if recorder.recording:
    recorder._stop()
# 11