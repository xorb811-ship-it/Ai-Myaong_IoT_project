"""
pose_test.py — 고양이/강아지 전용 포즈 추정 + 자세 분류 + 알림 + 녹화 + 캡처 통합본
"""

import cv2
import numpy as np
import time
import os
from collections import deque
from datetime import datetime
from ultralytics import YOLO

# ── 모델 로드 ──────────────────────────────────────────────────────────
det_model  = YOLO("yolov8n.pt")        # 고양이/강아지/사람 감지용
pose_model = YOLO("yolo26n-pose.pt")   # 동물 전용 24개 키포인트 추출 모델

# COCO 클래스 ID
PET_CLASSES = {15: "Cat", 16: "Dog"}

# 동물 전용 관절 매핑 및 뼈대 정보
KP = {
    "nose":        0,
    "neck":        4,   
    "tail_base":   5,   
    "fl_shoulder": 6,   "fl_ankle": 8,   
    "fr_shoulder": 9,   "fr_ankle": 11,  
    "hl_hip":      12,  "hl_ankle": 14,  
    "hr_hip":      15,  "hr_ankle": 17,  
}

SKELETON = [
    (0, 4), (4, 5),          
    (4, 6), (6, 8),          
    (4, 9), (9, 11),         
    (5, 12), (12, 14),       
    (5, 15), (15, 17),       
]

KP_COLOR = {
    "head": (100, 220, 100),
    "body": (255, 180, 50),
    "front": (80, 180, 255),
    "back": (220, 80, 220)
}

# ── 자세 분류 알고리즘 ──────────────────────────────────────────────────
def classify_pose(kpts, frame_h):
    CONF_THRESHOLD = 0.30
    if kpts is None or len(kpts) == 0:
        return "Unknown", 0.0

    def get_pt(idx):
        if idx >= len(kpts): return None
        return (float(kpts[idx][0]), float(kpts[idx][1])) if kpts[idx][2] > CONF_THRESHOLD else None

    valid = [(kpts[i][0], kpts[i][1]) for i in range(len(kpts)) if i < len(kpts) and kpts[i][2] > CONF_THRESHOLD]
    if len(valid) < 3:
        return "Unknown", 0.0

    xs, ys = [p[0] for p in valid], [p[1] for p in valid]
    body_w = max(xs) - min(xs)
    body_h = max(ys) - min(ys)
    aspect = body_w / (body_h + 1e-5)   

    ankles = [get_pt(KP["fl_ankle"]), get_pt(KP["fr_ankle"]), get_pt(KP["hl_ankle"]), get_pt(KP["hr_ankle"])]
    ankle_ys = [p[1] for p in ankles if p is not None]
    ankle_spread = (max(ankle_ys) - min(ankle_ys)) / (frame_h + 1e-5) if len(ankle_ys) >= 2 else 0.0

    neck = get_pt(KP["neck"])
    tail = get_pt(KP["tail_base"])
    spine_slope = abs(neck[1] - tail[1]) / (body_h + 1e-5) if neck and tail else 0.0

    front_xs = [kpts[i][0] for i in [KP["fl_ankle"], KP["fr_ankle"]] if i < len(kpts) and kpts[i][2] > CONF_THRESHOLD]
    back_xs = [kpts[i][0] for i in [KP["hl_ankle"], KP["hr_ankle"]] if i < len(kpts) and kpts[i][2] > CONF_THRESHOLD]
    spread_x = abs(np.mean(front_xs) - np.mean(back_xs)) / (body_w + 1e-5) if front_xs and back_xs else 0.0

    if aspect > 1.7 and ankle_spread < 0.12: return "Lying down", 0.88
    if spread_x > 1.3: return "Stretching", 0.82
    if aspect < 1.3 and spine_slope > 0.32: return "Sitting", 0.85
    if ankle_spread > 0.14: return "Walking / Running", 0.78
    if aspect < 1.6: return "Standing", 0.76
        
    return "Active", 0.60

# ── 활동량 측정 ────────────────────────────────────────────────────────
movement_history = deque(maxlen=30)
prev_kpts = None

def calc_activity(kpts):
    global prev_kpts
    if kpts is None or prev_kpts is None:
        prev_kpts = kpts
        return 0.0, "Measuring..."

    dists = []
    for i in range(min(len(kpts), len(prev_kpts))):
        if kpts[i][2] > 0.3 and prev_kpts[i][2] > 0.3:
            dx = kpts[i][0] - prev_kpts[i][0]
            dy = kpts[i][1] - prev_kpts[i][1]
            dists.append(np.sqrt(dx**2 + dy**2))

    movement = float(np.mean(dists)) if dists else 0.0
    movement_history.append(movement)
    prev_kpts = kpts

    level = min(1.0, movement / 40.0)
    avg = np.mean(movement_history)
    trend = ("Very calm" if avg < 2 else "Calm" if avg < 8 else "Active" if avg < 20 else "Very active")
    return level, trend

POSE_COLOR = {
    "Lying down":        (100, 200, 100),
    "Sitting":           (100, 180, 255),
    "Standing":          (255, 200,  80),
    "Walking / Running": (80,  80, 220),
    "Stretching":        (200, 100, 255),
    "Active":            (200, 200, 200),
    "Unknown":           (120, 120, 120),
}

def draw_pet_skeleton(frame, kpts):
    for i, j in SKELETON:
        if i >= len(kpts) or j >= len(kpts): continue
        if kpts[i][2] < 0.3 or kpts[j][2] < 0.3: continue
        cv2.line(frame, (int(kpts[i][0]), int(kpts[i][1])), (int(kpts[j][0]), int(kpts[j][1])), (220, 220, 220), 2, cv2.LINE_AA)
    
    for idx, (x, y, c) in enumerate(kpts):
        if c < 0.3: continue
        if idx in [0, 4]: color = KP_COLOR["head"]
        elif idx == 5: color = KP_COLOR["body"]
        elif idx in [6, 8, 9, 11]: color = KP_COLOR["front"]
        elif idx in [12, 14, 15, 17]: color = KP_COLOR["back"]
        else: color = (200, 200, 200)
        cv2.circle(frame, (int(x), int(y)), 4, color, -1, cv2.LINE_AA)

def draw_panel(frame, species, pose, conf, act_level, act_trend, w):
    px, py, pw, ph = w - 225, 10, 215, 175

    overlay = frame.copy()
    cv2.rectangle(overlay, (px,py), (px+pw, py+ph), (20,20,20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
    cv2.rectangle(frame, (px,py), (px+pw, py+ph), (80,80,80), 1)

    color = POSE_COLOR.get(pose, (200,200,200))
    bar_w = pw - 16

    cv2.putText(frame, f"[{species.upper()}]" if species else "[Detecting...]", (px+8, py+22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160,160,160), 1)
    cv2.putText(frame, pose, (px+8, py+48), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
    
    cv2.rectangle(frame, (px+8, py+58), (px+8+bar_w, py+68), (50,50,50), -1)
    cv2.rectangle(frame, (px+8, py+58), (px+8+int(bar_w*conf), py+68), color, -1)
    cv2.putText(frame, f"conf {conf:.0%}", (px+8, py+82), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (140,140,140), 1)

    cv2.putText(frame, f"Activity: {act_trend}", (px+8, py+102), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (180,180,180), 1)
    act_color = ((100,200,100) if act_level < 0.3 else (100,180,255) if act_level < 0.7 else (80,80,220))
    cv2.rectangle(frame, (px+8, py+110), (px+8+bar_w, py+120), (50,50,50), -1)
    cv2.rectangle(frame, (px+8, py+110), (px+8+int(bar_w*act_level), py+120), act_color, -1)

    legend = [("Head", KP_COLOR["head"]), ("Body", KP_COLOR["body"]), ("Front", KP_COLOR["front"]), ("Back", KP_COLOR["back"])]
    lx = px + 8
    for label, lc in legend:
        cv2.circle(frame, (lx+4, py+138), 4, lc, -1)
        cv2.putText(frame, label, (lx+11, py+142), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (160,160,160), 1)
        lx += 54

# ── 알림 시스템 ────────────────────────────────────────────────────────
ALERT_COLORS = {
    "FALL"    : (0, 0, 220),   
    "ABNORMAL": (0, 140, 255),   
    "NO_MOTION": (0, 200, 255),   
    "INTRUDER": (220, 0, 220),   
}
ALERT_COOLDOWN = 8 

class AlertSystem:
    def __init__(self):
        self.alerts = deque(maxlen=5)
        self.last_fired = {}
        self.bbox_y_history = deque(maxlen=30)   
        self.no_motion_start = None              
        self.position_history = deque(maxlen=90)  
        self.pose_history = deque(maxlen=45)  
        self.away_mode = False

    def update(self, frame, track_bbox, pose_str, act_level, raw_boxes):
        now = time.time()
        cx, cy, bh = None, None, None
        if track_bbox:
            x, y, w, h = track_bbox
            cx, cy = x + w // 2, y + h // 2
            bh = h  

        self._check_fall(now, cy, bh, act_level)
        self._check_abnormal(now, cx, cy, pose_str, act_level)
        self._check_no_motion(now, act_level)
        if self.away_mode:
            self._check_intruder(now, raw_boxes)

    def _check_fall(self, now, cy, bh, act_level):
        if cy is None or bh is None: return
        self.bbox_y_history.append((now, cy))
        if len(self.bbox_y_history) < 10: return

        recent = [(t, y) for t, y in self.bbox_y_history if now - t < 0.5]
        if len(recent) < 3: return
        
        y_drop = recent[-1][1] - recent[0][1]
        fall_threshold = max(80, int(bh * 0.7))
        
        if y_drop > fall_threshold and act_level < 0.15:
            self._fire("FALL", "Fall detected! Pet may be injured.")

    def _check_abnormal(self, now, cx, cy, pose_str, act_level):
        if cx is None or cy is None: return
        self.position_history.append((cx, cy))
        self.pose_history.append(pose_str)

        if len(self.position_history) < 50: return
        if pose_str == "Lying down" or act_level < 0.25: return

        pts = np.array(self.position_history)
        start_pt, end_pt = pts[0], pts[-1]
        actual_move_dist = np.linalg.norm(end_pt - start_pt)

        std = np.std(pts, axis=0).mean()
        span = np.ptp(pts, axis=0).mean()

        if actual_move_dist > 40 and std < 35 and span > 50 and span < 150:
            self._fire("ABNORMAL", "Abnormal pacing behavior detected.")

        if len(self.pose_history) >= 40:
            unique_poses = set(self.pose_history)
            if len(unique_poses) <= 1 and not any(p in unique_poses for p in ["Unknown", "Detecting...", "Lying down", "Standing"]):
                if list(self.pose_history).count(pose_str) > 35:
                    self._fire("ABNORMAL", f"Repetitive behavior: {pose_str}")

    def _check_no_motion(self, now, act_level):
        NO_MOTION_SEC = 180   
        if act_level < 0.05:
            if self.no_motion_start is None:
                self.no_motion_start = now
            elif now - self.no_motion_start >= NO_MOTION_SEC:
                elapsed = int(now - self.no_motion_start)
                self._fire("NO_MOTION", f"No motion for {elapsed}s. Check pet!")
        else:
            self.no_motion_start = None

    def _check_intruder(self, now, raw_boxes):
        if raw_boxes is None: return
        for box in raw_boxes:
            if int(box.cls[0]) == 0 and float(box.conf[0]) > 0.5: 
                self._fire("INTRUDER", "Intruder Warning! Human detected.")
                break

    def _fire(self, alert_type, message):
        now = time.time()
        if now - self.last_fired.get(alert_type, 0) < ALERT_COOLDOWN: return

        self.last_fired[alert_type] = now
        ts = datetime.now().strftime("%H:%M:%S")
        self.alerts.appendleft({"type": alert_type, "message": message, "time": ts, "age": now})
        print(f"[ALERT][{alert_type}] {ts} — {message}")

    def draw_alerts(self, frame, h, w):
        now = time.time()

        if self.away_mode:
            cv2.rectangle(frame, (0, 0), (w, 22), (60, 0, 60), -1)
            cv2.putText(frame, "AWAY MODE ACTIVE — Intruder Detection On", (8, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 100, 220), 1)

        panel_y = h - 35
        for alert in list(self.alerts):
            age = now - alert["age"]
            alpha = max(0.3, 1.0 - (age - 20) / 20) if age > 20 else 1.0
            color = tuple(int(c * alpha) for c in ALERT_COLORS.get(alert["type"], (200,200,200)))
            text = f"[{alert['time']}] {alert['message']}"
            
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(frame, (8, panel_y - th - 4), (14 + tw, panel_y + 2), (20, 20, 20), -1)
            cv2.putText(frame, text, (10, panel_y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1)
            panel_y -= (th + 8)

    def toggle_away_mode(self):
        self.away_mode = not self.away_mode
        print(f"[Away Mode] Toggled -> {self.away_mode}")

alert_system = AlertSystem()

# ── 클립 저장 및 이미지 캡처 시스템 ──────────────────────────────────────────
CLIP_DIR    = "clips"
CAPTURE_DIR = "captures"  # ★ [추가] 캡처 전용 로컬 폴더 경로 정의
MAX_SEC     = 60
FPS         = 15

os.makedirs(CLIP_DIR, exist_ok=True)
os.makedirs(CAPTURE_DIR, exist_ok=True)  # ★ [추가] 캡처 폴더 자동 생성

class ManualRecorder:
    def __init__(self):
        self.recording = False
        self.rec_frames = []
        self.start_time = None
        self.current_file = ""

    def toggle(self, w, h):
        if not self.recording:
            self.rec_frames = []
            self.start_time = time.time()
            self.recording = True
            self.current_file = os.path.join(CLIP_DIR, f"clip_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4")
            print(f"[Rec] Recording Started -> {self.current_file}")
        else:
            self._stop()

    def _stop(self):
        if self.rec_frames:
            h, w = self.rec_frames[0].shape[:2]
            writer = cv2.VideoWriter(self.current_file, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (w, h))
            for f in self.rec_frames: writer.write(f)
            writer.release()
            print(f"[Rec] Saved Completed ({len(self.rec_frames)/FPS:.1f}s)")
        self.recording = False
        self.rec_frames = []

    def write(self, raw_frame):
        if self.recording: self.rec_frames.append(raw_frame.copy())

    def check_auto_stop(self):
        if self.recording and time.time() - self.start_time >= MAX_SEC:
            self._stop()

    def elapsed(self):
        return time.time() - self.start_time if self.recording else 0.0

recorder = ManualRecorder()

# ── 메인 파이프라인 ────────────────────────────────────────────────────
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

ret, init_frame = cap.read()
if not ret or init_frame is None:
    print("[오류] 카메라에서 프레임을 읽어올 수 없습니다. 장치 연결을 확인하세요.")
    exit()
h, w = init_frame.shape[:2]

pose_smoothing_buffer = deque(maxlen=7)
current_species = ""
current_kpts = None
current_pose = ("Unknown", 0.0)

print("Pet Pose & Safety Monitoring System Layer Active.")

while True:
    ret, frame = cap.read()
    if not ret: break

    frame = cv2.flip(frame, 1)
    now = time.time()

    raw_frame = frame.copy()  # 그래픽이 그려지지 않은 순수 원본 프레임 백업
    recorder.write(raw_frame)
    recorder.check_auto_stop()

    det_results = det_model(frame, verbose=False, conf=0.35)[0]
    raw_boxes = det_results.boxes if det_results.boxes is not None else None

    best_pet_box = None
    if raw_boxes is not None:
        for box in raw_boxes:
            cls_id = int(box.cls[0])
            if cls_id in PET_CLASSES:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                best_pet_box = (x1, y1, x2 - x1, y2 - y1)
                current_species = PET_CLASSES[cls_id]
                break 

    current_kpts = None
    if best_pet_box is not None:
        x, y, bw, bh = best_pet_box
        pad_x, pad_y = int(bw * 0.25), int(bh * 0.25)
        x1c, y1c = max(0, x - pad_x), max(0, y - pad_y)
        x2c, y2c = min(w, x + bw + pad_x), min(h, y + bh + pad_y)
        crop = frame[y1c:y2c, x1c:x2c]

        if crop.size > 0:
            pose_results = pose_model(crop, verbose=False)[0]
            if pose_results.keypoints is not None and len(pose_results.keypoints.data) > 0:
                kpts_raw = pose_results.keypoints.data[0].cpu().numpy()
                kpts_raw[:, 0] += x1c
                kpts_raw[:, 1] += y1c
                current_kpts = kpts_raw
                
                raw_pose, raw_conf = classify_pose(current_kpts, h)
                if raw_pose != "Unknown":
                    pose_smoothing_buffer.append((raw_pose, raw_conf))

        cv2.rectangle(frame, (x, y), (x + bw, y + bh), (80, 200, 80), 2)

    if pose_smoothing_buffer:
        poses_list = [p[0] for p in pose_smoothing_buffer]
        best_pose_str = max(set(poses_list), key=poses_list.count)
        best_pose_conf = [p[1] for p in pose_smoothing_buffer if p[0] == best_pose_str][0]
        current_pose = (best_pose_str, best_pose_conf)
    else:
        current_pose = ("Detecting...", 0.0)

    if current_kpts is not None:
        draw_pet_skeleton(frame, current_kpts)

    act_level, act_trend = calc_activity(current_kpts)
    
    pose_str, pose_conf = current_pose
    alert_system.update(frame, best_pet_box, pose_str, act_level, raw_boxes)
    
    draw_panel(frame, current_species if best_pet_box else "", pose_str, pose_conf, act_level, act_trend, w)
    alert_system.draw_alerts(frame, h, w)

    fps = 1.0 / (time.time() - now + 1e-5)
    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)

    if recorder.recording:
        cv2.circle(frame, (15, 48), 5, (0, 0, 255), -1)
        cv2.putText(frame, f"REC {recorder.elapsed():.0f}s | S to Save", (26, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
    else:
        # ★ [수정] 안내 자막에 'C: Capture' 단축키 추가 안내
        cv2.putText(frame, "S: Record | C: Capture | A: Away Mode | Q: Quit", (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 140, 140), 1)

    cv2.imshow("Pet Pose Estimator", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q') or key == 27: break
    elif key == ord('s'): recorder.toggle(w, h)
    elif key == ord('a'): alert_system.toggle_away_mode()
    
    # ★ [추가] C 키 입력 시 캡처 기능 실행
    elif key == ord('c'):
        capture_file = os.path.join(CAPTURE_DIR, f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
        cv2.imwrite(capture_file, raw_frame)  # 깔끔한 원본 이미지 저장
        print(f"[Capture] Image Saved -> {capture_file}")

cap.release()
cv2.destroyAllWindows()
if recorder.recording: recorder._stop()