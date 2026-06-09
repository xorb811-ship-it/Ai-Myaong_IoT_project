import { NavLink } from 'react-router-dom'
import { Home, Video, UtensilsCrossed, Settings as SettingsIcon, User } from 'lucide-react'

const TABS = [
  { to: '/', label: '대시보드', icon: Home, end: true, tour: 'dashboard' },
  { to: '/vision', label: '로봇 비전', icon: Video, tour: 'vision' },
  { to: '/dispenser', label: '디스펜서', icon: UtensilsCrossed, tour: 'dispenser' },
  { to: '/settings', label: '설정', icon: SettingsIcon },
  { to: '/mypage', label: '마이 페이지', icon: User },
]

export function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 bg-brand-card/95 backdrop-blur-md border-t border-brand-line pb-safe">
      <ul className="flex justify-around items-stretch px-2 pt-1.5">
        {TABS.map(({ to, label, icon: Icon, end, tour }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              data-tour={tour}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-2xl no-select touch-active"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex items-center justify-center w-10 h-10 rounded-2xl transition-colors ${
                      isActive ? 'bg-brand-primary/15' : 'bg-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${isActive ? 'text-brand-primary' : 'text-brand-mute'}`}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  </span>
                  <span className={`text-[10px] font-semibold whitespace-nowrap ${isActive ? 'text-brand-primary' : 'text-brand-mute'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
