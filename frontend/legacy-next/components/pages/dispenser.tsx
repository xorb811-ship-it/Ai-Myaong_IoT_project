"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { 
  Cookie, 
  Clock, 
  Bell,
  Plus,
  Trash2,
  Activity,
  Scale,
  CheckCircle2,
  Droplets,
  Minus
} from "lucide-react"
import { useState } from "react"

interface Schedule {
  id: string
  time: string
  foodAmount: number
  waterAmount: number
  enabled: boolean
}

export function DispenserPage() {
  const [autoFeed, setAutoFeed] = useState(true)
  const [motionFeed, setMotionFeed] = useState(false)
  const [foodAmount, setFoodAmount] = useState([50])
  const [waterAmount, setWaterAmount] = useState([100])
  const [schedules, setSchedules] = useState<Schedule[]>([
    { id: "1", time: "08:00", foodAmount: 50, waterAmount: 100, enabled: true },
    { id: "2", time: "12:00", foodAmount: 30, waterAmount: 80, enabled: true },
    { id: "3", time: "18:00", foodAmount: 50, waterAmount: 100, enabled: true },
  ])

  const toggleSchedule = (id: string) => {
    setSchedules(prev => 
      prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    )
  }

  const deleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  const adjustFoodAmount = (delta: number) => {
    setFoodAmount(prev => [Math.max(10, Math.min(200, prev[0] + delta))])
  }

  const adjustWaterAmount = (delta: number) => {
    setWaterAmount(prev => [Math.max(20, Math.min(500, prev[0] + delta))])
  }

  const dispenseNow = () => {
    alert(`사료 ${foodAmount[0]}g, 물 ${waterAmount[0]}ml 급여를 시작합니다.`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">디스펜서</h1>
          <p className="text-muted-foreground text-sm mt-1">사료/물 급여 관리 및 스케줄 설정</p>
        </div>
        <Button onClick={dispenseNow}>
          <Cookie className="w-4 h-4 mr-2" />
          지금 급여하기
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">남은 사료량</p>
              <p className="text-2xl font-bold text-foreground mt-1">약 70%</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cookie className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: "70%" }} />
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">남은 물량</p>
              <p className="text-2xl font-bold text-foreground mt-1">약 85%</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-chart-2/10 flex items-center justify-center">
              <Droplets className="w-6 h-6 text-chart-2" />
            </div>
          </div>
          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-chart-2 rounded-full" style={{ width: "85%" }} />
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">디스펜서 상태</p>
              <p className="text-2xl font-bold text-primary mt-1">정상</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            ESP32 연결됨 (MQTT)
          </p>
        </Card>
      </div>

      {/* Amount Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Food Amount */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cookie className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground">사료 급여량 설정</h3>
              <p className="text-xs text-muted-foreground">1회 급여 시 지급할 사료량</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => adjustFoodAmount(-10)}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-24">
              <span className="text-4xl font-bold text-foreground">{foodAmount[0]}</span>
              <span className="text-lg text-muted-foreground ml-1">g</span>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => adjustFoodAmount(10)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <Slider 
            value={foodAmount} 
            onValueChange={setFoodAmount} 
            min={10}
            max={200} 
            step={5}
            className="mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>10g</span>
            <span>200g</span>
          </div>
        </Card>

        {/* Water Amount */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground">물 급여량 설정</h3>
              <p className="text-xs text-muted-foreground">1회 급여 시 지급할 물량</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => adjustWaterAmount(-20)}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-24">
              <span className="text-4xl font-bold text-foreground">{waterAmount[0]}</span>
              <span className="text-lg text-muted-foreground ml-1">ml</span>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => adjustWaterAmount(20)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <Slider 
            value={waterAmount} 
            onValueChange={setWaterAmount} 
            min={20}
            max={500} 
            step={10}
            className="mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>20ml</span>
            <span>500ml</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feeding Schedule */}
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-card-foreground">급여 스케줄</h2>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              추가
            </Button>
          </div>
          
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div 
                key={schedule.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-secondary-foreground">{schedule.time}</p>
                    <p className="text-xs text-muted-foreground">
                      사료 {schedule.foodAmount}g / 물 {schedule.waterAmount}ml
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={schedule.enabled}
                    onCheckedChange={() => toggleSchedule(schedule.id)}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteSchedule(schedule.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Settings */}
        <Card className="p-4 bg-card border-border">
          <h2 className="font-semibold text-card-foreground mb-4">급여 설정</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-secondary-foreground">자동 급여</p>
                  <p className="text-xs text-muted-foreground">설정된 스케줄에 따라 자동 급여</p>
                </div>
              </div>
              <Switch checked={autoFeed} onCheckedChange={setAutoFeed} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-secondary-foreground">모션 감지 급여</p>
                  <p className="text-xs text-muted-foreground">PIR 센서 감지 시 자동 급여</p>
                </div>
              </div>
              <Switch checked={motionFeed} onCheckedChange={setMotionFeed} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-secondary-foreground">알림</p>
                  <p className="text-xs text-muted-foreground">급여 완료 시 알림 전송</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>
      </div>

      {/* Feeding History */}
      <Card className="p-4 bg-card border-border">
        <h2 className="font-semibold text-card-foreground mb-4">급여 기록</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-sm font-medium text-muted-foreground py-2 px-3">시간</th>
                <th className="text-left text-sm font-medium text-muted-foreground py-2 px-3">사료</th>
                <th className="text-left text-sm font-medium text-muted-foreground py-2 px-3">물</th>
                <th className="text-left text-sm font-medium text-muted-foreground py-2 px-3">방식</th>
                <th className="text-left text-sm font-medium text-muted-foreground py-2 px-3">상태</th>
              </tr>
            </thead>
            <tbody>
              <HistoryRow time="오늘 14:32" foodAmount="50g" waterAmount="100ml" method="자동" status="완료" />
              <HistoryRow time="오늘 12:00" foodAmount="30g" waterAmount="80ml" method="스케줄" status="완료" />
              <HistoryRow time="오늘 08:00" foodAmount="50g" waterAmount="100ml" method="스케줄" status="완료" />
              <HistoryRow time="어제 18:00" foodAmount="50g" waterAmount="100ml" method="스케줄" status="완료" />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Device Info */}
      <Card className="p-4 bg-card border-border">
        <h3 className="font-semibold text-card-foreground mb-4">장치 정보</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="제어보드" value="ESP32 DevKit" />
          <InfoItem label="서보 모터" value="MG90S" />
          <InfoItem label="모션 센서" value="PIR HC-SR301" />
          <InfoItem label="통신" value="MQTT" />
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

function HistoryRow({ 
  time, 
  foodAmount,
  waterAmount,
  method, 
  status 
}: { 
  time: string
  foodAmount: string
  waterAmount: string
  method: string
  status: string
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-3 px-3 text-sm text-foreground">{time}</td>
      <td className="py-3 px-3 text-sm text-foreground">{foodAmount}</td>
      <td className="py-3 px-3 text-sm text-chart-2">{waterAmount}</td>
      <td className="py-3 px-3 text-sm text-muted-foreground">{method}</td>
      <td className="py-3 px-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
          {status}
        </span>
      </td>
    </tr>
  )
}
