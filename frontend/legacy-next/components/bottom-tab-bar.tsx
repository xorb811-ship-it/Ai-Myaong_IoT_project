"use client"

import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Camera, 
  Cookie, 
  Settings
} from "lucide-react"

interface BottomTabBarProps {
  activeMenu: string
  onMenuChange: (menu: string) => void
}

export function BottomTabBar({ activeMenu, onMenuChange }: BottomTabBarProps) {
  const menuItems = [
    { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
    { id: "robot-vision", label: "로봇비전", icon: Camera },
    { id: "dispenser", label: "디스펜서", icon: Cookie },
    { id: "settings", label: "세팅", icon: Settings },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-50 safe-area-bottom">
      {menuItems.map((item) => {
        const Icon = item.icon
        const isActive = activeMenu === item.id
        
        return (
          <button
            key={item.id}
            onClick={() => onMenuChange(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors",
              isActive 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
            <span className={cn(
              "text-xs font-medium",
              isActive && "text-primary"
            )}>
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
