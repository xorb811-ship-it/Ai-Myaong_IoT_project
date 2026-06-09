import { 
  LayoutDashboard, 
  Camera, 
  Cookie, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Wifi,
  User
} from 'lucide-react'

const menuItems = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'robot-vision', label: '로봇비전', icon: Camera },
  { id: 'dispenser', label: '디스펜서', icon: Cookie },
  { id: 'settings', label: '세팅', icon: Settings },
]

export function Sidebar({ activeMenu, onMenuChange, collapsed, onToggleCollapse, userName = '사용자' }) {
  return (
    <aside className={`
      fixed inset-y-0 left-0 z-40 flex flex-col
      bg-card border-r border-border transition-all duration-300
      ${collapsed ? 'w-16' : 'w-64'}
    `}>
      {/* Logo */}
      <div className={`
        flex items-center gap-3 p-4 border-b border-border
        ${collapsed ? 'justify-center' : ''}
      `}>
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="font-bold text-foreground">PetCare</h1>
            <p className="text-xs text-muted-foreground">IoT System</p>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className={`
        flex items-center gap-2 px-4 py-3 border-b border-border
        ${collapsed ? 'justify-center' : ''}
      `}>
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        {!collapsed && (
          <span className="text-xs text-muted-foreground">연결됨</span>
        )}
        <Wifi className={`w-4 h-4 text-success ${collapsed ? '' : 'ml-auto'}`} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeMenu === item.id
          return (
            <button
              key={item.id}
              onClick={() => onMenuChange(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all
                ${collapsed ? 'justify-center' : ''}
                ${isActive 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }
              `}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* User Profile */}
      <div className={`p-3 border-t border-border ${collapsed ? 'px-2' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground">관리자</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
