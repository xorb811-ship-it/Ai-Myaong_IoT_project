import { useEffect, useState } from "react";
import {
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Scale,
  Search,
  Lightbulb,
  Info,
  Check,
  ChevronDown,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  UtensilsCrossed,
  Droplets,
  Activity,
  Target,
  Clock,
  Stethoscope,
} from './icons';
import { Card } from "./ui";
import { api } from "../api/api";

const C = {
  cream: "rgb(var(--brand-cream))",
  brown: "rgb(var(--brand-brown))",
  mute: "rgb(var(--brand-mute))",
  primary: "rgb(var(--brand-primary))",
};


/* 카테고리별 컬러 테마 (literal 클래스라 tailwind가 인식) */
const TONE = {
  blue: { icon: "bg-brand-water/15 text-brand-water", bar: "bg-brand-water", badge: "bg-brand-water/15 text-brand-water", soft: "bg-brand-water/[0.06]", ring: "ring-brand-water", text: "text-brand-water" },
  coral: { icon: "bg-brand-primary/15 text-brand-primary", bar: "bg-brand-primary", badge: "bg-brand-primary/15 text-brand-primary", soft: "bg-brand-primary/[0.06]", ring: "ring-brand-primary", text: "text-brand-primary" },
  green: { icon: "bg-brand-success/20 text-[rgb(var(--brand-success-ink))]", bar: "bg-brand-success", badge: "bg-brand-success/20 text-[rgb(var(--brand-success-ink))]", soft: "bg-brand-success/[0.08]", ring: "ring-brand-success", text: "text-[rgb(var(--brand-success-ink))]" },
  amber: { icon: "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]", bar: "bg-brand-warning", badge: "bg-brand-warning/25 text-[rgb(var(--brand-warning-ink))]", soft: "bg-brand-warning/[0.10]", ring: "ring-brand-warning", text: "text-[rgb(var(--brand-warning-ink))]" },
  gray: { icon: "bg-brand-brown/10 text-brand-brown", bar: "bg-brand-mute", badge: "bg-brand-brown/10 text-brand-brown", soft: "bg-brand-cream/60", ring: "ring-brand-mute", text: "text-brand-mute" },
};

// 카드 배경: 흰색 80% + 크림 20% (지정) / 정보·칩 배경: 따뜻한 탄
const BG_CARD = "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)";
const BG_INFO = "color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)";

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = "" }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border-2 border-dashed border-brand-brown/20 ${className}`} />
  );
}

/* 종이질감 장식 아이콘 — 아이콘 실루엣(public/icons/*.svg)을 마스크로 써서 paper.jpg 텍스처를
 * 그 모양 안에만 보이게 한다. 아이콘 출처: Phosphor Icons (MIT) — public/icons/{paw,bone,heart}.svg */
function PaperIcon({ shape, color, className = "", opacity = 1 }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: "url(/paper.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundBlendMode: "multiply",
        WebkitMaskImage: `url(/icons/${shape}.svg)`,
        maskImage: `url(/icons/${shape}.svg)`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        opacity,
      }}
    />
  );
}

/**
 * AI 생활(건강) 리포트 패널.
 * - 상단: 요약(상태) + 이번 주 변화(증가/감소)
 * - 5개 분석을 아코디언 카드로 → 탭하면 제자리에서 펼침
 */
export function HealthReportPanel({ pet }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [justOpened, setJustOpened] = useState(null);

  const toggle = (key) => {
    const willOpen = !openKeys.has(key);
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (willOpen) next.add(key);
      else next.delete(key);
      return next;
    });
    setJustOpened(willOpen ? key : null);
  };

  useEffect(() => {
    let alive = true;
    if (!pet?.pet_id) return undefined;

    setInitialLoading(true);
    setError("");
    api
      .getLatestHealthReport(pet.pet_id)
      .then((data) => {
        if (alive) setReport(data);
      })
      .catch(() => {
        if (alive) setReport(null);
      })
      .finally(() => {
        if (alive) setInitialLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [pet?.pet_id]);

  const handleCreate = async () => {
    if (!pet?.pet_id || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.createHealthReport(pet.pet_id);
      setReport(data);
      setOpenKeys(new Set());
      setJustOpened(null);
    } catch (err) {
      setError(err?.message || "건강 리포트를 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  const advice = parseReportResult(report?.llm_result);
  const metrics = report?.input_summary?.computed_metrics;
  const quality = report?.input_summary?.data_quality;
  const period = report?.period;

  const categories = buildCategories(advice);

  useEffect(() => {
    if (!justOpened) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`hr-detail-${justOpened}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
    return () => clearTimeout(t);
  }, [justOpened]);

  return (
    <div className="mt-4 space-y-3">
      {loading && <LoadingOverlay />}

      {error && (
        <div className="rounded-2xl px-3 py-2.5 bg-brand-danger/10 text-brand-danger text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {initialLoading ?
        <Card className="px-5 py-10 text-center">
          <RefreshCw className="w-5 h-5 mx-auto animate-spin" style={{ color: C.primary }} />
          <p className="mt-2 text-sm font-bold" style={{ color: C.brown }}>
            최근 리포트를 불러오는 중이에요.
          </p>
        </Card>
      : !pet?.pet_id ?
        <Card className="px-5 py-10 text-center">
          <p className="text-sm font-bold" style={{ color: C.brown }}>
            반려동물을 먼저 등록해 주세요
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: C.mute }}>
            서버에 저장된 반려동물만 AI 건강 분석을 받아볼 수 있어요.
          </p>
        </Card>
      : report ?
        <>
          {/* 개요: 요약 + 상태 (새 리포트 생성도 여기 우상단) */}
          <SummaryCard pet={pet} report={report} advice={advice} metrics={metrics} period={period} onRegenerate={handleCreate} loading={loading} />

          {/* 이번 주 변화 — 증가/감소 텍스트 */}
          {metrics && <TrendCard metrics={metrics} quality={quality} />}

          {/* 분석 5종 — 행 단위 grid + 펼침/접힘 애니메이션 */}
          <div className="space-y-3">
            {chunk2(categories).map((row, rowIdx) => {
              const single = row.length === 1;
              return (
                <div key={rowIdx}>
                  <div className={`grid gap-3 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
                    {row.map((cat) => (
                      <CategoryCard
                        key={cat.key}
                        icon={cat.icon}
                        title={cat.title}
                        count={cat.items.length}
                        preview={cat.preview}
                        tone={cat.tone}
                        img={cat.img}
                        imgClass={cat.imgClass}
                        active={openKeys.has(cat.key)}
                        disabled={cat.items.length === 0}
                        wide={single}
                        onClick={() => toggle(cat.key)}
                      />
                    ))}
                  </div>
                  {row.map((cat) => {
                    const notchLeft =
                      single ? "50%" : row[0].key === cat.key ? "25%" : "75%";
                    return (
                      <Collapsible key={cat.key} open={openKeys.has(cat.key)}>
                        <div
                          id={`hr-detail-${cat.key}`}
                          className={`relative mt-2.5 scroll-mt-4 rounded-3xl border-2 border-dashed border-brand-brown/15 shadow-soft ${cat.tone.soft}`}
                        >
                          {/* 어느 카드(왼/오)의 상세인지 가리키는 포인터 */}
                          <span
                            className={`pointer-events-none absolute -top-1.5 h-3 w-3 rotate-45 rounded-sm ${cat.tone.bar}`}
                            style={{ left: notchLeft, marginLeft: "-6px" }}
                          />
                          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-8 h-8 shrink-0 rounded-full border border-dashed border-brand-brown/20 flex items-center justify-center ${cat.tone.icon}`}>
                                {cat.icon}
                              </span>
                              <h4 className="text-[15px] font-extrabold truncate" style={{ color: C.brown }}>
                                {cat.title}
                              </h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggle(cat.key)}
                              aria-label="닫기"
                              className="w-7 h-7 shrink-0 rounded-xl bg-brand-card/70 flex items-center justify-center text-brand-mute touch-active"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="px-3 pb-3 pt-1">{cat.render()}</div>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {advice.disclaimer && (
            <p
              className="rounded-2xl border border-dashed border-brand-brown/20 px-4 py-3 text-[11px] font-semibold leading-relaxed text-[rgb(var(--brand-warning-ink))]"
              style={{ backgroundColor: BG_INFO }}
            >
              {advice.disclaimer}
            </p>
          )}
        </>
      : <EmptyState loading={loading} onCreate={handleCreate} />
      }
    </div>
  );
}

/* ───────────────────────── 개요 카드 ───────────────────────── */

const RISK_DISPLAY = {
  low: { word: "양호", Icon: Check, pill: "bg-brand-success/15 text-[rgb(var(--brand-success-ink))]", aura: "bg-brand-success/40" },
  medium: { word: "주의", Icon: AlertTriangle, pill: "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]", aura: "bg-brand-warning/40" },
  high: { word: "경고", Icon: ShieldAlert, pill: "bg-brand-danger/15 text-brand-danger", aura: "bg-brand-danger/45" },
  unknown: { word: "확인 필요", Icon: Info, pill: "bg-brand-brown/10 text-brand-brown", aura: "bg-brand-line" },
};

function SummaryCard({ pet, report, advice, metrics, period, onRegenerate, loading }) {
  const r = RISK_DISPLAY[report?.risk_level] || RISK_DISPLAY.unknown;
  const meta = [pet?.name, "최근 7일 요약"].filter(Boolean).join(" · ");
  return (
    <div className="relative overflow-hidden rounded-[28px] shadow-soft-lg" style={{ backgroundColor: BG_CARD }}>
      <Stitch className="!inset-[8px] !rounded-[22px]" />
      {/* 위험도 톤 오라 (은은한 컬러 글로우) */}
      <div className={`aura-glow pointer-events-none absolute -right-10 -top-12 w-44 h-44 rounded-full ${r.aura} blur-3xl opacity-50`} />
      {/* 종이질감 발바닥/뼈 장식 */}
      <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute right-5 bottom-5 w-16 h-16 rotate-6" />
      <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute left-7 top-28 w-8 h-8 -rotate-12" />

      <div className="relative p-6">
        {/* 헤더: 라벨 + 기간 */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg bg-brand-primary/12 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
            </span>
            <p className="text-[11px] font-extrabold tracking-wide text-brand-mute">
              AI 생활 리포트
            </p>
          </div>
          {period && (
            <span className="text-[11px] font-semibold text-brand-mute">
              {period.start} ~ {period.end}
            </span>
          )}
        </div>

        {/* 상태 칩 (스티치) */}
        <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-brown/25 px-3 py-1.5 text-xs font-extrabold ${r.pill}`}>
          <r.Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
          {r.word}
        </div>

        {/* 요약 (히어로 타이포) — 가볍게 + 줄바꿈 균형 */}
        <p className="mt-3 text-[17px] font-semibold leading-relaxed tracking-tight text-balance" style={{ color: C.brown }}>
          {advice.summary || "리포트 요약을 표시할 수 없어요."}
        </p>
        {meta && (
          <p className="mt-2.5 text-[11px] font-semibold text-brand-mute">{meta}</p>
        )}

        {/* 지표 스트립 (점선 패널 + 귀여운 아이콘) */}
        {metrics && (
          <div className="relative mt-5 rounded-2xl py-4" style={{ backgroundColor: BG_INFO }}>
            <Stitch className="!inset-[5px] !rounded-[15px]" />
            <div className="relative grid grid-cols-3">
              <Stat icon={<UtensilsCrossed className="w-5 h-5 text-brand-primary" />} label="급식" value={formatAmount(metrics.avg_food_g_per_day, "g")} change={metrics.food_change_percent} trend={metrics.food_trend} />
              <Stat icon={<Droplets className="w-5 h-5 text-brand-water" />} label="급수" value={formatAmount(metrics.avg_water_ml_per_day, "ml")} change={metrics.water_change_percent} trend={metrics.water_trend} />
              <Stat icon={<Activity className="w-5 h-5 text-brand-primary-deep" />} label="활동" value={formatAmount(metrics.avg_activity_level, "")} change={metrics.activity_change_percent} trend={metrics.activity_trend} />
            </div>
          </div>
        )}

        {/* 새 리포트 생성 (탄 스티치 버튼) */}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-brown/25 px-4 py-3.5 text-sm font-bold text-brand-brown shadow-soft touch-active disabled:opacity-60"
          style={{ backgroundColor: BG_INFO }}
        >
          <RefreshCw className="w-4 h-4" />
          새 리포트 생성
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, change, trend }) {
  const showTrend = trend && trend !== "stable" && change != null;
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div className="px-2 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold" style={{ color: C.mute }}>
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-extrabold leading-none" style={{ color: C.brown }}>{value}</p>
      {showTrend && (
        <p className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: C.mute }}>
          <TrendIcon className="w-3 h-3" />
          {Math.abs(change)}%
        </p>
      )}
    </div>
  );
}

const TREND = {
  up: { label: "증가중", cls: "text-brand-success", Icon: TrendingUp },
  down: { label: "감소중", cls: "text-brand-danger", Icon: TrendingDown },
  stable: { label: "유지중", cls: "text-brand-mute", Icon: Minus },
};

function TrendRow({ icon, label, avg, trend, change }) {
  const t = TREND[trend] || TREND.stable;
  return (
    <div
      className="flex items-center justify-between rounded-2xl border border-dashed border-brand-brown/15 px-3.5 py-3"
      style={{ backgroundColor: BG_INFO }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 shrink-0 rounded-full border border-dashed border-brand-brown/20 bg-brand-primary/12 text-brand-primary flex items-center justify-center">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: C.mute }}>
            {label}
          </p>
          <p className="text-base font-extrabold leading-tight" style={{ color: C.brown }}>
            {avg}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`inline-flex items-center gap-1 text-[15px] font-extrabold ${t.cls}`}>
          <t.Icon className="w-4 h-4" strokeWidth={2.6} />
          {t.label}
        </p>
        {change != null && trend !== "stable" && (
          <p className="text-[11px] font-bold" style={{ color: C.mute }}>
            지난주 대비 {change > 0 ? "+" : ""}
            {change}%
          </p>
        )}
      </div>
    </div>
  );
}

function TrendCard({ metrics, quality }) {
  return (
    <div className="relative rounded-3xl shadow-soft p-4" style={{ backgroundColor: BG_CARD }}>
      <Stitch />
      <div className="relative">
      <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title="이번 주 변화" />
      <div className="space-y-2">
        <TrendRow
          icon={<UtensilsCrossed className="w-4 h-4" />}
          label="급식"
          avg={formatAmount(metrics.avg_food_g_per_day, "g")}
          trend={metrics.food_trend}
          change={metrics.food_change_percent}
        />
        <TrendRow
          icon={<Droplets className="w-4 h-4" />}
          label="급수"
          avg={formatAmount(metrics.avg_water_ml_per_day, "ml")}
          trend={metrics.water_trend}
          change={metrics.water_change_percent}
        />
        <TrendRow
          icon={<Activity className="w-4 h-4" />}
          label="활동"
          avg={formatAmount(metrics.avg_activity_level, "")}
          trend={metrics.activity_trend}
          change={metrics.activity_change_percent}
        />
      </div>
      {quality && (
        <p className="mt-2.5 text-[11px] font-semibold leading-relaxed text-center" style={{ color: C.mute }}>
          데이터 품질: 급식 {quality.feed_days}일 · 급수 {quality.water_days}일 · 활동 {quality.activity_days}일
        </p>
      )}
      </div>
    </div>
  );
}

/* ───────────────────────── 분석 카테고리 ───────────────────────── */

function buildCategories(advice) {
  return [
    {
      key: "reference",
      title: "품종·나이 기준 비교",
      icon: <Scale className="w-[18px] h-[18px]" />,
      img: "/cat-animation/cat-feed/cat_12_feed.png",
      tone: TONE.blue,
      items: advice.reference_comparison,
      preview: advice.reference_comparison[0]?.metric,
      render: () => (
        <div className="space-y-2">
          {advice.reference_comparison.map((item, i) => (
            <ThemedItem key={i} tone={TONE.blue}>
              <p className="break-keep text-[15px] font-extrabold" style={{ color: C.brown }}>
                {item.metric || "비교 항목"}
              </p>
              {item.judgment && (
                <p className={`mt-1.5 rounded-lg px-2.5 py-1.5 break-keep text-[11px] font-bold leading-relaxed ${TONE.blue.badge}`}>
                  {item.judgment}
                </p>
              )}
              {item.reference && (
                <SubLine icon={<Target className="w-3.5 h-3.5 text-brand-water" />} label="기준" text={item.reference} />
              )}
              {item.actual && (
                <SubLine icon={<Check className="w-3.5 h-3.5 text-brand-water" strokeWidth={3} />} label="실제" text={item.actual} strong />
              )}
            </ThemedItem>
          ))}
        </div>
      ),
    },
    {
      key: "findings",
      title: "핵심 관찰",
      icon: <Search className="w-[18px] h-[18px]" />,
      img: "/ai-analysis/cat_search.png",
      imgClass: "w-16 h-16 -bottom-1 -right-1 -scale-x-100",
      tone: TONE.coral,
      items: advice.key_findings,
      preview: advice.key_findings[0]?.title,
      render: () => (
        <div className="space-y-2">
          {advice.key_findings.map((item, i) => (
            <ThemedItem key={i} tone={TONE.coral}>
              <p className="text-[15px] font-extrabold leading-snug" style={{ color: C.brown }}>
                {item.title || "관찰"}
              </p>
              {item.evidence && (
                <p className="mt-1 text-sm leading-relaxed" style={{ color: C.brown }}>
                  {item.evidence}
                </p>
              )}
              {item.meaning && (
                <p className="mt-2 rounded-xl bg-brand-primary/[0.07] px-2.5 py-1.5 text-xs leading-relaxed" style={{ color: C.mute }}>
                  💡 {item.meaning}
                </p>
              )}
            </ThemedItem>
          ))}
        </div>
      ),
    },
    {
      key: "advice",
      title: "맞춤 조언",
      icon: <Lightbulb className="w-[18px] h-[18px]" />,
      img: "/ai-analysis/cat_advice.png",
      imgClass: "w-[88px] h-[88px] -bottom-1 -right-4",
      tone: TONE.green,
      items: advice.personalized_advice,
      preview: advice.personalized_advice[0]?.action,
      render: () => (
        <div className="space-y-2">
          {advice.personalized_advice.map((item, i) => (
            <ThemedItem key={i} tone={TONE.green}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-brand-success/20 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-[rgb(var(--brand-success-ink))]" strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold leading-snug" style={{ color: C.brown }}>
                    {item.action || "확인할 행동"}
                  </p>
                  {item.reason && (
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: C.brown }}>
                      {item.reason}
                    </p>
                  )}
                  {item.check_after && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2.5 py-1 text-[11px] font-bold" style={{ color: "rgb(var(--brand-success-ink))" }}>
                      <Clock className="w-3 h-3" /> {item.check_after}
                    </p>
                  )}
                </div>
              </div>
            </ThemedItem>
          ))}
        </div>
      ),
    },
    {
      key: "watch",
      title: "주의 신호",
      icon: <ShieldAlert className="w-[18px] h-[18px]" />,
      img: "/ai-analysis/cat_danger.png",
      imgClass: "w-[76px] h-[76px] -bottom-1 -right-1",
      tone: TONE.amber,
      items: advice.watch_points,
      preview: advice.watch_points[0]?.item,
      render: () => (
        <div className="space-y-2">
          {advice.watch_points.map((item, i) => (
            <ThemedItem key={i} tone={TONE.amber}>
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-[rgb(var(--brand-warning-ink))]" />
                <p className="text-[15px] font-extrabold leading-snug" style={{ color: C.brown }}>
                  {item.item || "주의 항목"}
                </p>
              </div>
              {item.why && (
                <p className="mt-1 text-sm leading-relaxed" style={{ color: C.brown }}>
                  {item.why}
                </p>
              )}
              {item.when_to_consult_vet && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-brand-warning/15 px-2.5 py-1.5 text-[11px] font-bold leading-relaxed" style={{ color: "rgb(var(--brand-warning-ink))" }}>
                  <Stethoscope className="w-3.5 h-3.5 mt-px shrink-0" /> {item.when_to_consult_vet}
                </p>
              )}
            </ThemedItem>
          ))}
        </div>
      ),
    },
    {
      key: "limitations",
      title: "분석 한계",
      icon: <Info className="w-[18px] h-[18px]" />,
      tone: TONE.gray,
      items: advice.data_limitations,
      preview: advice.data_limitations[0],
      render: () => (
        <div className="space-y-2">
          {advice.data_limitations.map((item, i) => (
            <ThemedItem key={i} tone={TONE.gray}>
              <p className="flex items-start gap-1.5 text-sm leading-relaxed" style={{ color: C.brown }}>
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-mute" />
                {item}
              </p>
            </ThemedItem>
          ))}
        </div>
      ),
    },
  ];
}

function chunk2(arr) {
  const rows = [];
  for (let k = 0; k < arr.length; k += 2) rows.push(arr.slice(k, k + 2));
  return rows;
}

/** 펼침/접힘 height 애니메이션 (열 때·닫을 때 모두 부드럽게) */
function Collapsible({ open, children }) {
  const [render, setRender] = useState(open);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      // double rAF: 초기 0fr 상태를 먼저 페인트한 뒤 펼쳐야 첫 트랜지션이 잡힘
      let id2;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setExpanded(true));
      });
      return () => {
        cancelAnimationFrame(id1);
        if (id2) cancelAnimationFrame(id2);
      };
    }
    setExpanded(false);
    const t = setTimeout(() => setRender(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  if (!render) return null;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function CategoryCard({ icon, title, count, preview, tone, active, disabled, wide, img, imgClass = "w-16 h-16 -bottom-1 -right-1", onClick }) {
  const t = tone || TONE.coral;
  const shell = `relative text-left rounded-3xl shadow-soft p-4 touch-active disabled:opacity-50 disabled:active:scale-100 transition-all border-2 border-dashed ${
    active ? `ring-2 ${t.ring} border-transparent` : "border-brand-brown/20"
  } ${wide ? "col-span-2" : ""}`;

  const iconChip = (
    <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border border-dashed border-brand-brown/20 ${t.icon}`}>
      {icon}
    </span>
  );
  const countBadge = (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${t.badge}`}>
      {count}
    </span>
  );
  const cta = !disabled && (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold ${t.text}`}>
      {active ? "닫기" : "보기"}
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${active ? "rotate-180" : "-rotate-90"}`} />
    </span>
  );

  // 풀폭(마지막 홀수 카드) → 가로 레이아웃
  if (wide) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={`flex items-center gap-3 ${shell}`} style={{ backgroundColor: BG_CARD }}>
        {iconChip}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-extrabold" style={{ color: C.brown }}>
              {title}
            </p>
            {countBadge}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed truncate" style={{ color: C.mute }}>
            {disabled ? "내용 없음" : preview || "탭하여 상세 보기"}
          </p>
        </div>
        <span className="shrink-0">{cta}</span>
      </button>
    );
  }

  // 기본 → 세로 레이아웃
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`overflow-hidden flex flex-col h-full ${shell}`} style={{ backgroundColor: BG_CARD }}>
      {/* 카테고리 일러스트 (우하단 스티커) */}
      {img && (
        <img
          src={img}
          alt=""
          aria-hidden
          draggable={false}
          className={`pointer-events-none absolute object-contain drop-shadow-sm ${imgClass}`}
        />
      )}
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between">
          {iconChip}
          {countBadge}
        </div>
        <p className="mt-2.5 text-[15px] font-extrabold leading-snug" style={{ color: C.brown }}>
          {title}
        </p>
        <p className={`mt-1 flex-1 text-xs leading-relaxed line-clamp-2 ${img ? "pr-12" : ""}`} style={{ color: C.mute }}>
          {disabled ? "내용 없음" : preview || "탭하여 상세 보기"}
        </p>
        {cta && <span className="mt-2">{cta}</span>}
      </div>
    </button>
  );
}

/* ───────────────────────── 공통 조각 ───────────────────────── */

function LoadingOverlay() {
  // 앱이 max-w-[480px] 모바일 프레임이라, 오버레이도 그 폭 안에서만 표시
  return (
    <div className="fixed inset-0 z-[70] flex justify-center pointer-events-none">
      <div className="relative w-full max-w-[480px] h-full flex items-center justify-center px-8 bg-brand-bg/90 backdrop-blur-sm pointer-events-auto">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative w-20 h-20">
            <span className="absolute inset-0 rounded-full bg-brand-primary/15 animate-ping" />
            <span className="relative w-20 h-20 rounded-full bg-brand-primary/12 flex items-center justify-center">
              <Sparkles className="w-9 h-9 text-brand-primary animate-pulse" />
            </span>
          </div>
          <div>
            <p className="text-base font-extrabold text-brand-brown">
              AI가 분석하고 있어요
            </p>
            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-brand-mute">
              최근 7일의 급식·급수·활동 데이터를 살펴보는 중이에요.
              <br />
              잠시만 기다려 주세요.
            </p>
          </div>
          <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ loading, onCreate }) {
  return (
    <Card className="px-5 py-8 text-center">
      <span className="mx-auto w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center">
        <Sparkles className="w-7 h-7" style={{ color: C.primary }} />
      </span>
      <p className="mt-3 text-sm font-bold" style={{ color: C.brown }}>
        아직 생성된 리포트가 없어요
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: C.mute }}>
        버튼을 누르면 최근 7일 데이터를 분석해 리포트를 만들어요.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={loading}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-bold text-white shadow-press touch-active disabled:opacity-60"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "리포트 생성 중" : "건강 리포트 생성"}
      </button>
    </Card>
  );
}

function SectionHeader({ icon, title, tone = "primary" }) {
  const chip =
    tone === "warning" ?
      "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]"
    : "bg-brand-primary/12 text-brand-primary";
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className={`w-7 h-7 rounded-xl flex items-center justify-center ${chip}`}>{icon}</span>
      <p className="text-sm font-bold" style={{ color: C.brown }}>{title}</p>
    </div>
  );
}

function ThemedItem({ tone, children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-card border border-brand-line/60 shadow-sm">
      <span className={`absolute left-0 inset-y-0 w-1 ${tone.bar}`} />
      <div className="pl-4 pr-3.5 py-3">{children}</div>
    </div>
  );
}

function SubLine({ icon, label, text, strong }) {
  return (
    <div className="mt-1.5 flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-xs leading-relaxed" style={{ color: strong ? C.brown : C.mute }}>
        <span className="font-extrabold">{label}</span> {text}
      </p>
    </div>
  );
}

function parseReportResult(value) {
  const fallback = {
    summary: "",
    reference_comparison: [],
    key_findings: [],
    personalized_advice: [],
    watch_points: [],
    data_limitations: [],
    disclaimer: "",
  };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return {
      summary: parsed.summary || "",
      reference_comparison:
        Array.isArray(parsed.reference_comparison) ? parsed.reference_comparison : [],
      key_findings:
        Array.isArray(parsed.key_findings) ? parsed.key_findings
        : Array.isArray(parsed.observations) ?
          parsed.observations.map((item) => ({ title: "관찰 요약", evidence: item, meaning: "" }))
        : [],
      personalized_advice:
        Array.isArray(parsed.personalized_advice) ? parsed.personalized_advice
        : Array.isArray(parsed.advice) ?
          parsed.advice.map((item) => ({ action: item, reason: "", check_after: "" }))
        : [],
      watch_points:
        Array.isArray(parsed.watch_points) ? parsed.watch_points
        : Array.isArray(parsed.warning_signs) ?
          parsed.warning_signs.map((item) => ({ item, why: "", when_to_consult_vet: "" }))
        : [],
      data_limitations:
        Array.isArray(parsed.data_limitations) ? parsed.data_limitations : [],
      disclaimer: parsed.disclaimer || "",
    };
  } catch {
    return { ...fallback, summary: value };
  }
}

function formatAmount(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  const formatted = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}
