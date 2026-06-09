"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Camera,
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  RotateCcw,
  Maximize2,
  Settings2,
  Circle,
  Square,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { useState, useCallback } from "react"

export function RobotVisionPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [panValue, setPanValue] = useState(90)
  const [tiltValue, setTiltValue] = useState(90)

  const movePan = useCallback((direction: 'left' | 'right') => {
    setPanValue(prev => {
      const step = 10
      if (direction === 'left') return Math.max(0, prev - step)
      return Math.min(180, prev + step)
    })
  }, [])

  const moveTilt = useCallback((direction: 'up' | 'down') => {
    setTiltValue(prev => {
      const step = 10
      if (direction === 'up') return Math.max(0, prev - step)
      return Math.min(180, prev + step)
    })
  }, [])

  const resetPosition = useCallback(() => {
    setPanValue(90)
    setTiltValue(90)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">로봇비전</h1>
          <p className="text-muted-foreground text-sm mt-1">실시간 카메라 스트리밍 및 로봇 제어</p>
        </div>
        <Button 
          variant={isRecording ? "destructive" : "outline"} 
          size="sm"
          onClick={() => setIsRecording(prev => !prev)}
        >
          <Circle className={`w-4 h-4 mr-2 ${isRecording ? "fill-current animate-pulse" : ""}`} />
          {isRecording ? "녹화 중지" : "녹화하기"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Stream - always on */}
        <Card className="lg:col-span-2 p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-card-foreground">카메라 스트림</h2>
            <div className="flex items-center gap-2">
              {isRecording && (
                <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  REC
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                LIVE
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Camera feed area - always visible */}
          <div className="aspect-video bg-secondary rounded-lg relative overflow-hidden">
            {/* Simulated camera feed background */}
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-muted to-secondary" />

            {/* Scan line overlay for a live-feed feel */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
              }}
            />

            {/* Center content */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center opacity-30">
                <Camera className="w-16 h-16 text-foreground mx-auto mb-2" />
                <p className="text-sm text-foreground">OV5647 · WebRTC 연결 중...</p>
              </div>
            </div>

            {/* Corner crosshair markers */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-primary/60 rounded-tl" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-primary/60 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-primary/60 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-primary/60 rounded-br" />

            {/* Bottom info bar */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <span className="text-xs text-foreground/60 bg-background/40 px-2 py-1 rounded backdrop-blur-sm">
                1280 × 720 · 30fps
              </span>
              {isRecording && (
                <span className="text-xs text-destructive bg-background/40 px-2 py-1 rounded backdrop-blur-sm font-medium">
                  00:00:12
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Controls Panel */}
        <div className="space-y-4">
          {/* Pan/Tilt Control */}
          <Card className="p-4 bg-card border-border">
            <h3 className="font-semibold text-card-foreground mb-4">팬/틸트 제어</h3>
            
            <div className="flex justify-center mb-4">
              <div className="grid grid-cols-3 gap-1 w-36">
                <div />
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-11 w-11"
                  onClick={() => moveTilt('up')}
                >
                  <ChevronUp className="w-5 h-5" />
                </Button>
                <div />
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-11 w-11"
                  onClick={() => movePan('left')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-11 w-11"
                  onClick={resetPosition}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-11 w-11"
                  onClick={() => movePan('right')}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
                <div />
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-11 w-11"
                  onClick={() => moveTilt('down')}
                >
                  <ChevronDown className="w-5 h-5" />
                </Button>
                <div />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary text-center">
                <p className="text-xs text-muted-foreground mb-1">팬 (좌/우)</p>
                <p className="text-lg font-bold text-foreground">{panValue}&deg;</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary text-center">
                <p className="text-xs text-muted-foreground mb-1">틸트 (상/하)</p>
                <p className="text-lg font-bold text-foreground">{tiltValue}&deg;</p>
              </div>
            </div>
          </Card>

          {/* Robot Movement */}
          <Card className="p-4 bg-card border-border">
            <h3 className="font-semibold text-card-foreground mb-4">로봇 이동</h3>
            <div className="flex justify-center">
              <div className="grid grid-cols-3 gap-1 w-36">
                <div />
                <Button variant="outline" size="icon" className="h-11 w-11">
                  <ArrowUp className="w-5 h-5" />
                </Button>
                <div />
                <Button variant="outline" size="icon" className="h-11 w-11">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Button variant="destructive" size="icon" className="h-11 w-11">
                  <Square className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-11 w-11">
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <div />
                <Button variant="outline" size="icon" className="h-11 w-11">
                  <ArrowDown className="w-5 h-5" />
                </Button>
                <div />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              캐터필러 모터 제어 (L298N)
            </p>
          </Card>
        </div>
      </div>

      {/* Device Info */}
      <Card className="p-4 bg-card border-border">
        <h3 className="font-semibold text-card-foreground mb-4">장치 정보</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="카메라" value="OV5647" />
          <InfoItem label="연결" value="CSI 인터페이스" />
          <InfoItem label="서보 모터" value="SG90/MG90S" />
          <InfoItem label="제어보드" value="Raspberry Pi 4" />
        </div>
      </Card>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-secondary-foreground mt-1">{value}</p>
    </div>
  )
}
