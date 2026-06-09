import { useEffect } from 'react'

const KEY_COMMANDS = {
  KeyW: 'FORWARD',
  ArrowUp: 'FORWARD',
  KeyS: 'BACKWARD',
  ArrowDown: 'BACKWARD',
  KeyA: 'LEFT',
  ArrowLeft: 'LEFT',
  KeyD: 'RIGHT',
  ArrowRight: 'RIGHT',
  Space: 'STOP',
}

export function useKeyboard(onCommand) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      if (isTyping) {
        return
      }

      const command = KEY_COMMANDS[event.code]
      if (!command) {
        return
      }
      event.preventDefault()
      onCommand(command)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCommand])
}
