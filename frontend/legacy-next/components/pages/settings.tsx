"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { 
  Wifi, 
  Server,
  Monitor,
  Shield,
  Bell,
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle2,
  Info
} from "lucide-react"
import { useState } from "react"

export function SettingsPage() {
  const [serverIp, setServerIp] = useState("192.168.0.100")
  const [mqttBroker, setMqttBroker] = useState("192.168.0.100:1883")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">세팅</h1>
        <p className="text-muted-foreground text-sm mt-1">시스템 설정 및 네트워크 구성</p>
      </div>

      {/* Connection Status */}
      <Card className="p-4 bg-card border-border">
        <h2 className="font-semibold text-card-foreground mb-4">연결 상태</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ConnectionStatus 
            name="Desktop PC (서버)"
            status="connected"
            details="192.168.0.100"
            protocol="TCP/WebSocket"
          />
          <ConnectionStatus 
            name="Raspberry Pi 4 (로봇)"
            status="connected"
            details="192.168.0.101"
            protocol="Wi-Fi"
          />
          <ConnectionStatus 
            name="ESP32 (디스펜서)"
            status="connected"
            details="MQTT 연결됨"
            protocol="Wi-Fi / MQTT"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Settings */}
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-card-foreground">네트워크 설정</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">서버 IP 주소</label>
              <Input 
                value={serverIp} 
                onChange={(e) => setServerIp(e.target.value)}
                className="mt-1"
                placeholder="192.168.0.100"
              />
              <p className="text-xs text-muted-foreground mt-1">Desktop PC (OpenCV 서버) 주소</p>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">MQTT Broker</label>
              <Input 
                value={mqttBroker} 
                onChange={(e) => setMqttBroker(e.target.value)}
                className="mt-1"
                placeholder="192.168.0.100:1883"
              />
              <p className="text-xs text-muted-foreground mt-1">디스펜서 통신용 MQTT 브로커</p>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">WebRTC STUN 서버</label>
              <Input 
                defaultValue="stun:stun.l.google.com:19302"
                className="mt-1"
              />
            </div>

            <Button className="w-full mt-2">
              <Save className="w-4 h-4 mr-2" />
              설정 저장
            </Button>
          </div>
        </Card>

        {/* System Settings */}
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-card-foreground">시스템 설정</h2>
          </div>
          
          <div className="space-y-3">
            <SettingItem 
              icon={Bell}
              title="푸시 알림"
              description="급여, 모션 감지 알림 수신"
              defaultChecked
            />
            <SettingItem 
              icon={Shield}
              title="자동 재연결"
              description="연결 끊김 시 자동 재연결"
              defaultChecked
            />
            <SettingItem 
              icon={RefreshCw}
              title="실시간 동기화"
              description="디바이스 상태 실시간 업데이트"
              defaultChecked
            />
            <SettingItem 
              icon={Server}
              title="로그 저장"
              description="시스템 로그 로컬 저장"
            />
          </div>
        </Card>
      </div>

      {/* Device Configuration */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-card-foreground">장치 구성</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Robot Device */}
          <div className="p-4 rounded-lg bg-secondary">
            <h3 className="font-medium text-secondary-foreground mb-3">로봇 (Pi4 + Arduino)</h3>
            <div className="space-y-2 text-sm">
              <ConfigItem label="메인보드" value="Raspberry Pi 4 (4GB)" />
              <ConfigItem label="카메라" value="OV5647 (CSI)" />
              <ConfigItem label="모터 드라이버" value="L298N" />
              <ConfigItem label="서보 모터" value="SG90/MG90S" />
              <ConfigItem label="MCU" value="Arduino UNO" />
              <ConfigItem label="전원" value="7.4V 배터리 + 5V UBEC" />
            </div>
          </div>

          {/* Dispenser Device */}
          <div className="p-4 rounded-lg bg-secondary">
            <h3 className="font-medium text-secondary-foreground mb-3">디스펜서 (ESP32)</h3>
            <div className="space-y-2 text-sm">
              <ConfigItem label="제어보드" value="ESP32 DevKit" />
              <ConfigItem label="서보 모터" value="MG90S" />
              <ConfigItem label="모션 센서" value="PIR HC-SR301" />
              <ConfigItem label="무게 센서" value="HX711 + 로드셀 (선택)" />
              <ConfigItem label="표시장치" value="LED / Buzzer" />
              <ConfigItem label="전원" value="5V 2A 어댑터" />
            </div>
          </div>
        </div>
      </Card>

      {/* Communication Protocol */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-card-foreground">통신 프로토콜</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ProtocolItem 
            from="Pi4" 
            to="Desktop" 
            protocol="TCP/WebSocket" 
            purpose="제어, 상태" 
          />
          <ProtocolItem 
            from="Pi4" 
            to="ESP32" 
            protocol="MQTT" 
            purpose="급여 명령, 상태" 
          />
          <ProtocolItem 
            from="Pi4" 
            to="Arduino" 
            protocol="USB Serial" 
            purpose="모터 제어" 
          />
          <ProtocolItem 
            from="Pi4" 
            to="카메라" 
            protocol="CSI" 
            purpose="영상 스트리밍" 
          />
        </div>
      </Card>

      {/* Actions */}
      <Card className="p-4 bg-card border-border">
        <h2 className="font-semibold text-card-foreground mb-4">시스템 관리</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            시스템 재시작
          </Button>
          <Button variant="outline">
            연결 테스트
          </Button>
          <Button variant="outline">
            로그 내보내기
          </Button>
          <Button variant="destructive">
            설정 초기화
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ConnectionStatus({ 
  name, 
  status, 
  details, 
  protocol 
}: { 
  name: string
  status: "connected" | "disconnected"
  details: string
  protocol: string
}) {
  return (
    <div className="p-4 rounded-lg bg-secondary">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-secondary-foreground text-sm">{name}</span>
        {status === "connected" ? (
          <CheckCircle2 className="w-4 h-4 text-primary" />
        ) : (
          <AlertCircle className="w-4 h-4 text-destructive" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{details}</p>
      <p className="text-xs text-muted-foreground mt-1">{protocol}</p>
    </div>
  )
}

function SettingItem({ 
  icon: Icon, 
  title, 
  description, 
  defaultChecked 
}: { 
  icon: React.ElementType
  title: string
  description: string
  defaultChecked?: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="font-medium text-secondary-foreground text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  )
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-secondary-foreground">{value}</span>
    </div>
  )
}

function ProtocolItem({ 
  from, 
  to, 
  protocol, 
  purpose 
}: { 
  from: string
  to: string
  protocol: string
  purpose: string
}) {
  return (
    <div className="p-3 rounded-lg bg-secondary text-center">
      <p className="text-xs text-muted-foreground">{from} ↔ {to}</p>
      <p className="font-medium text-secondary-foreground text-sm mt-1">{protocol}</p>
      <p className="text-xs text-muted-foreground mt-1">{purpose}</p>
    </div>
  )
}
