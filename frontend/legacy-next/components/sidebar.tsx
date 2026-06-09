"use client"

import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Camera, 
  Cookie, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Wifi,
  User
} from "lucide-react"

interface SidebarProps {
  activeMenu: string
  onMenuChange: (menu: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  userName?: string
}

const menuItems = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "robot-vision", label: "로봇비전", icon: Camera },
  { id: "dispenser", label: "디스펜서", icon: Cookie },
  { id: "settings", label: "세팅", icon: Settings },
]

export function Sidebar({ activeMenu, onMenuChange, collapsed, onToggleCollapse, userName = "사용자" }: SidebarProps) {
  return (
    <aside 
      className={cn(
        "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">P</span>
            </div>
            <span className="font-semibold text-sidebar-foreground">PetCare IoT</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className={cn(
        "px-4 py-3 border-b border-sidebar-border",
        collapsed && "px-2"
      )}>
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent",
          collapsed && "justify-center px-2"
        )}>
          <Wifi className="w-4 h-4 text-primary" />
          {!collapsed && (
            <span className="text-xs text-sidebar-foreground">연결됨</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeMenu === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onMenuChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* User Profile */}
      <div className={cn(
        "p-3 border-t border-sidebar-border",
        collapsed && "px-2"
      )}>
        <div className={cn(
          "flex items-center gap-3",
          collapsed && "justify-center"
        )}>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground">관리자</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
