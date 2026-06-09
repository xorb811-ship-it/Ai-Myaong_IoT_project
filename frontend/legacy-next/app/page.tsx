"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { BottomTabBar } from "@/components/bottom-tab-bar"
import { DashboardPage } from "@/components/pages/dashboard"
import { RobotVisionPage } from "@/components/pages/robot-vision"
import { DispenserPage } from "@/components/pages/dispenser"
import { SettingsPage } from "@/components/pages/settings"
import { Menu, Monitor, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function Home() {
  const [activeMenu, setActiveMenu] = useState("dashboard")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"web" | "app">("web")
  const userName = "김민수"

  const renderPage = () => {
    switch (activeMenu) {
      case "dashboard":
        return <DashboardPage userName={userName} />
      case "robot-vision":
        return <RobotVisionPage />
      case "dispenser":
        return <DispenserPage />
      case "settings":
        return <SettingsPage />
      default:
        return <DashboardPage userName={userName} />
    }
  }

  const handleMenuChange = (menu: string) => {
    setActiveMenu(menu)
    setMobileMenuOpen(false)
  }

  // App Version Layout
  if (viewMode === "app") {
    return (
      <div className="flex flex-col h-screen bg-background max-w-md mx-auto border-x border-border">
        {/* App Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
          <span className="font-semibold text-foreground">PetCare IoT</span>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setViewMode("web")}
            title="웹 버전으로 전환"
          >
            <Monitor className="w-5 h-5" />
          </Button>
        </header>

        {/* App Content */}
        <main className="flex-1 overflow-auto p-4 pb-20">
          {renderPage()}
        </main>

        {/* Bottom Tab Navigation */}
        <BottomTabBar 
          activeMenu={activeMenu}
          onMenuChange={handleMenuChange}
        />
      </div>
    )
  }

  // Web Version Layout
  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar 
          activeMenu={activeMenu}
          onMenuChange={handleMenuChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          userName={userName}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar 
          activeMenu={activeMenu}
          onMenuChange={handleMenuChange}
          collapsed={false}
          onToggleCollapse={() => setMobileMenuOpen(false)}
          userName={userName}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-14 border-b border-border flex items-center justify-between px-4 bg-background">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <span className="font-semibold text-foreground">PetCare IoT</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setViewMode("app")}
            title="앱 버전으로 전환"
          >
            <Smartphone className="w-5 h-5" />
          </Button>
        </header>

        {/* Desktop Header with View Toggle */}
        <header className="hidden md:flex h-14 border-b border-border items-center justify-end px-6 bg-background">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setViewMode("app")}
            className="gap-2"
          >
            <Smartphone className="w-4 h-4" />
            앱 버전 보기
          </Button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
