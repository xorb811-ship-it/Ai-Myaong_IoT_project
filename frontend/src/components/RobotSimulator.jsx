import { Navigation, Radio } from 'lucide-react'

export function RobotSimulator({ status, compact = false }) {
  const position = status?.position || { x: 0, y: 0, heading: 0 }
  const camera = status?.camera || { pan: 90, tilt: 90 }
  const x = clamp(50 + position.x * 5, 8, 92)
  const y = clamp(50 - position.y * 5, 8, 92)

  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">로봇 시뮬레이터</h3>
        </div>
        <span className="text-xs text-success">{status?.connected ? 'SIM ONLINE' : '대기'}</span>
      </div>

      <div className={`relative overflow-hidden rounded-lg bg-secondary border border-border ${compact ? 'h-48' : 'h-72'}`}>
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div className="absolute top-1/2 left-0 h-px w-full bg-border" />

        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-lg shadow-black/30 transition-transform duration-300"
            style={{ transform: `rotate(${position.heading}deg)` }}
          >
            <Navigation className="h-7 w-7 fill-white text-white" />
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground">
              x:{position.x} y:{position.y}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Metric label="방향" value={`${position.heading}°`} />
        <Metric label="팬" value={`${camera.pan}°`} />
        <Metric label="틸트" value={`${camera.tilt}°`} />
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  )
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
