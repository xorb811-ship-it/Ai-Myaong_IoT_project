"use client"

import { Card } from "@/components/ui/card"
import { 
  Camera, 
  Cookie, 
  Wifi,
  Activity,
  Battery,
  Clock,
  User
} from "lucide-react"

interface DashboardPageProps {
  userName?: string
}

export function DashboardPage({ userName = "사용자" }: DashboardPageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
          <p className="text-muted-foreground text-sm mt-1">시스템 전체 상태를 한눈에 확인하세요</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card border border-border">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{userName}</p>
            <p className="text-xs text-muted-foreground">관리자</p>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard 
          title="로봇 카메라"
          value="온라인"
          icon={Camera}
          status="online"
          description="마지막 확인: 방금 전"
        />
        <StatusCard 
          title="디스펜서"
          value="대기 중"
          icon={Cookie}
          status="online"
          description="남은 사료: 약 70%"
        />
        <StatusCard 
          title="배터리"
          value="85%"
          icon={Battery}
          status="warning"
          description="예상 사용시간: 4시간"
        />
        <StatusCard 
          title="네트워크"
          value="안정"
          icon={Wifi}
          status="online"
          description="지연: 12ms"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Preview */}
        <Card className="lg:col-span-2 p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-card-foreground">실시간 미리보기</h2>
            <span className="flex items-center gap-1 text-xs text-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              LIVE
            </span>
          </div>
          {/* Always-on camera preview */}
          <div className="aspect-video bg-secondary rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-muted to-secondary" />
            {/* Scanline effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
              }}
            />
            {/* Center placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center opacity-25">
                <Camera className="w-12 h-12 text-foreground mx-auto mb-2" />
                <p className="text-sm text-foreground">OV5647 · WebRTC</p>
              </div>
            </div>
            {/* Corner markers */}
            <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-primary/60 rounded-tl" />
            <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-primary/60 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-primary/60 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-primary/60 rounded-br" />
            {/* Info bar */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <span className="text-xs text-foreground/50 bg-background/30 px-2 py-0.5 rounded backdrop-blur-sm">
                1280 × 720 · 30fps
              </span>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-4 bg-card border-border">
          <h2 className="font-semibold text-card-foreground mb-4">최근 활동</h2>
          <div className="space-y-3">
            <ActivityItem 
              time="14:32"
              message="자동 급여 완료"
              type="success"
            />
            <ActivityItem 
              time="13:15"
              message="모션 감지됨"
              type="info"
            />
            <ActivityItem 
              time="12:00"
              message="예약 급여 완료"
              type="success"
            />
            <ActivityItem 
              time="10:45"
              message="배터리 충전 시작"
              type="warning"
            />
            <ActivityItem 
              time="09:30"
              message="시스템 시작"
              type="info"
            />
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-4 bg-card border-border">
        <h2 className="font-semibold text-card-foreground mb-4">빠른 실행</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionButton label="사료 급여" icon={Cookie} />
          <QuickActionButton label="카메라 확인" icon={Camera} />
          <QuickActionButton label="로봇 이동" icon={Activity} />
          <QuickActionButton label="상태 새로고침" icon={Clock} />
        </div>
      </Card>
    </div>
  )
}

function StatusCard({ 
  title, 
  value, 
  icon: Icon, 
  status, 
  description 
}: { 
  title: string
  value: string
  icon: React.ElementType
  status: "online" | "offline" | "warning"
  description: string
}) {
  const statusColors = {
    online: "text-primary",
    offline: "text-destructive",
    warning: "text-chart-3"
  }

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`text-lg font-semibold mt-1 ${statusColors[status]}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  )
}

function ActivityItem({ 
  time, 
  message, 
  type 
}: { 
  time: string
  message: string
  type: "success" | "info" | "warning" | "error"
}) {
  const colors = {
    success: "bg-primary",
    info: "bg-chart-2",
    warning: "bg-chart-3",
    error: "bg-destructive"
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-12">{time}</span>
      <span className={`w-2 h-2 rounded-full ${colors[type]}`} />
      <span className="text-sm text-card-foreground">{message}</span>
    </div>
  )
}

function QuickActionButton({ 
  label, 
  icon: Icon 
}: { 
  label: string
  icon: React.ElementType
}) {
  return (
    <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-secondary hover:bg-accent transition-colors">
      <Icon className="w-6 h-6 text-muted-foreground" />
      <span className="text-sm text-secondary-foreground">{label}</span>
    </button>
  )
}
