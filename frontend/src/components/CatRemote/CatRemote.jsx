import { useEffect, useRef, useState } from 'react'
import './CatRemote.css'

const FRAME_COUNT = 11
const FEED_FRAME_COUNT = 12
const GROOMING_FRAME_COUNT = 12
const TAIL_FRAME_COUNT = 12
const ANIMATION_DURATION = 1000
const FEED_ANIMATION_DURATION = 1300
const GROOMING_ANIMATION_DURATION = 2000
const HIDE_ANIMATION_DURATION = 2800
const TAIL_LOOP_DURATION = 2800
const TAIL_IDLE_DELAY = 3000
const TRANSITION_DURATION = 220
const ASSET_BASE = '/cat-animation'

const sleepFrames = Array.from({ length: FRAME_COUNT }, (_, index) => {
  const frameNumber = String(index + 1).padStart(2, '0')
  return `${ASSET_BASE}/cat-frames/cat_${frameNumber}_sleep.png`
})

const feedFrames = Array.from({ length: FEED_FRAME_COUNT }, (_, index) => {
  const frameNumber = String(index + 1).padStart(2, '0')
  return `${ASSET_BASE}/cat-feed/cat_${frameNumber}_feed.png`
})

const groomingFrames = Array.from({ length: GROOMING_FRAME_COUNT }, (_, index) => {
  return `${ASSET_BASE}/cat-grooming/${index + 1}.png`
})

const tailFrames = Array.from({ length: TAIL_FRAME_COUNT }, (_, index) => {
  const frameNumber = String(index + 1).padStart(2, '0')
  return `${ASSET_BASE}/cat-tail/cat_${frameNumber}_tail.png`
})

const hideFrames = Array.from({ length: 24 }, (_, index) => index + 1)
  .filter((frameNumber) => frameNumber !== 10 && frameNumber !== 20)
  .map((frameNumber) => `${ASSET_BASE}/cat-hide/${frameNumber}.png`)

const homeFrames = Array.from({ length: 7 }, (_, index) => {
  return `${ASSET_BASE}/cat-home/${index + 1}.png`
})

export function CatRemote() {
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [homeFrameIndex, setHomeFrameIndex] = useState(0)
  const [easterEggOpen, setEasterEggOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [frameSet, setFrameSet] = useState('sleep')
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [action, setAction] = useState('idle')
  const [switchingFrameSet, setSwitchingFrameSet] = useState(false)
  const animationRef = useRef(null)
  const tailAnimationRef = useRef(null)
  const timeoutRef = useRef(null)
  const tailTimeoutRef = useRef(null)
  const clickTimeoutRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const suppressNextClickRef = useRef(false)

  const frames =
    frameSet === 'feed'
      ? feedFrames
      : frameSet === 'grooming'
        ? groomingFrames
        : frameSet === 'tail'
          ? tailFrames
          : frameSet === 'hide'
            ? hideFrames
            : sleepFrames

  useEffect(() => {
    ;[
      ...sleepFrames,
      ...feedFrames,
      ...groomingFrames,
      ...tailFrames,
      ...hideFrames,
      ...homeFrames,
    ].forEach((frame) => {
      const image = new Image()
      image.src = frame
    })
  }, [])

  useEffect(() => {
    if (!remoteOpen || playing) {
      return undefined
    }

    tailTimeoutRef.current = setTimeout(() => {
      setSwitchingFrameSet(true)
      setFrameSet('tail')
      setFrameIndex(0)
      setAction('tailing')

      timeoutRef.current = setTimeout(() => {
        setSwitchingFrameSet(false)
        timeoutRef.current = null
      }, TRANSITION_DURATION)

      const startedAt = performance.now()

      const loopTail = (now) => {
        const elapsed = (now - startedAt) % TAIL_LOOP_DURATION
        const progress = elapsed / TAIL_LOOP_DURATION
        const nextFrame = Math.min(
          Math.floor(progress * TAIL_FRAME_COUNT),
          TAIL_FRAME_COUNT - 1,
        )

        setFrameIndex(nextFrame)
        tailAnimationRef.current = requestAnimationFrame(loopTail)
      }

      tailAnimationRef.current = requestAnimationFrame(loopTail)
    }, TAIL_IDLE_DELAY)

    return () => {
      if (tailTimeoutRef.current) {
        clearTimeout(tailTimeoutRef.current)
        tailTimeoutRef.current = null
      }

      if (tailAnimationRef.current) {
        cancelAnimationFrame(tailAnimationRef.current)
        tailAnimationRef.current = null
      }
    }
  }, [remoteOpen, playing])

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (tailAnimationRef.current) cancelAnimationFrame(tailAnimationRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (tailTimeoutRef.current) clearTimeout(tailTimeoutRef.current)
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current)
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current)
    }
  }, [])

  const clearPendingAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (tailAnimationRef.current) {
      cancelAnimationFrame(tailAnimationRef.current)
      tailAnimationRef.current = null
    }

    if (tailTimeoutRef.current) {
      clearTimeout(tailTimeoutRef.current)
      tailTimeoutRef.current = null
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const toggleRemote = () => {
    if (playing) return

    clearPendingAnimation()

    setRemoteOpen((current) => {
      const nextOpen = !current
      if (!nextOpen) setEasterEggOpen(false)
      setFrameSet('sleep')
      setFrameIndex(nextOpen ? 1 : 0)
      setAction('idle')
      return nextOpen
    })
  }

  const handleRemoteClick = () => {
    if (playing) return
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current)

    clickTimeoutRef.current = setTimeout(() => {
      toggleRemote()
      clickTimeoutRef.current = null
    }, 180)
  }

  const revealEasterEgg = () => {
    if (playing || frameSet !== 'sleep') return
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    clearPendingAnimation()
    setEasterEggOpen(true)
    setRemoteOpen(true)
    setFrameSet('sleep')
    setFrameIndex(1)
    setAction('idle')
  }

  const startLongPress = () => {
    if (playing || frameSet !== 'sleep') return
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current)

    longPressTimeoutRef.current = setTimeout(() => {
      longPressTimeoutRef.current = null
      suppressNextClickRef.current = true
      revealEasterEgg()
    }, 520)
  }

  const cancelLongPress = () => {
    if (!longPressTimeoutRef.current) return
    clearTimeout(longPressTimeoutRef.current)
    longPressTimeoutRef.current = null
  }

  const playMoveAnimation = (targetTop) => {
    if (playing) return

    setPlaying(true)
    setAction('jumping')
    setRemoteOpen(false)
    setEasterEggOpen(false)
    setFrameSet('sleep')
    setFrameIndex(1)
    window.scrollTo({ top: targetTop, behavior: 'smooth' })

    clearPendingAnimation()

    const startedAt = performance.now()
    const animatedFrameCount = FRAME_COUNT - 1

    const animate = (now) => {
      const progress = Math.min((now - startedAt) / ANIMATION_DURATION, 1)
      const nextFrame = Math.min(1 + Math.floor(progress * animatedFrameCount), FRAME_COUNT - 1)

      setFrameIndex(nextFrame)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      setFrameIndex(0)
      setPlaying(false)
      setAction('idle')
      animationRef.current = null
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const playActionAnimation = ({ actionName, frameSetName, frameCount, duration }) => {
    if (playing) return

    setPlaying(true)
    setAction(actionName)
    setRemoteOpen(false)
    setEasterEggOpen(false)
    setSwitchingFrameSet(true)
    setFrameSet(frameSetName)
    setFrameIndex(0)

    clearPendingAnimation()

    timeoutRef.current = setTimeout(() => {
      setSwitchingFrameSet(false)
      timeoutRef.current = null
    }, TRANSITION_DURATION)

    const startedAt = performance.now()

    const animate = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const nextFrame = Math.min(Math.floor(progress * frameCount), frameCount - 1)

      setFrameIndex(nextFrame)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      timeoutRef.current = setTimeout(() => {
        setSwitchingFrameSet(true)
        setFrameSet('sleep')
        setFrameIndex(0)
        setAction('idle')
        setPlaying(false)

        timeoutRef.current = setTimeout(() => {
          setSwitchingFrameSet(false)
          timeoutRef.current = null
        }, TRANSITION_DURATION)
      }, 240)

      animationRef.current = null
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const hideCat = (event) => {
    event.stopPropagation()
    if (playing) return

    setPlaying(true)
    setRemoteOpen(false)
    setEasterEggOpen(false)
    setSwitchingFrameSet(true)
    setFrameSet('hide')
    setFrameIndex(0)
    setAction('hiding')

    clearPendingAnimation()

    timeoutRef.current = setTimeout(() => {
      setSwitchingFrameSet(false)
      timeoutRef.current = null
    }, TRANSITION_DURATION)

    const startedAt = performance.now()

    const animate = (now) => {
      const progress = Math.min((now - startedAt) / HIDE_ANIMATION_DURATION, 1)
      const nextFrame = Math.min(Math.floor(progress * hideFrames.length), hideFrames.length - 1)

      setFrameIndex(nextFrame)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      setHomeFrameIndex(Math.floor(Math.random() * homeFrames.length))
      setHidden(true)
      setFrameSet('sleep')
      setFrameIndex(0)
      setAction('idle')
      setPlaying(false)
      animationRef.current = null
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const restoreCat = () => {
    if (playing) return
    clearPendingAnimation()
    setRestoring(true)
    setEasterEggOpen(false)

    timeoutRef.current = setTimeout(() => {
      setHidden(false)
      setRemoteOpen(false)
      setSwitchingFrameSet(true)
      setFrameSet('sleep')
      setFrameIndex(0)
      setAction('idle')
      setRestoring(false)

      timeoutRef.current = setTimeout(() => {
        setSwitchingFrameSet(false)
        timeoutRef.current = null
      }, TRANSITION_DURATION)
    }, 520)
  }

  const feedCat = (event) => {
    event.stopPropagation()
    playActionAnimation({
      actionName: 'feeding',
      frameSetName: 'feed',
      frameCount: FEED_FRAME_COUNT,
      duration: FEED_ANIMATION_DURATION,
    })
  }

  const groomingCat = (event) => {
    event.stopPropagation()
    playActionAnimation({
      actionName: 'grooming',
      frameSetName: 'grooming',
      frameCount: GROOMING_FRAME_COUNT,
      duration: GROOMING_ANIMATION_DURATION,
    })
  }

  const moveToTop = (event) => {
    event.stopPropagation()
    playMoveAnimation(0)
  }

  const moveToBottom = (event) => {
    event.stopPropagation()
    const bottom = document.documentElement.scrollHeight - window.innerHeight
    playMoveAnimation(Math.max(bottom, 0))
  }

  return (
    <div className={`cat-remote-wrap ${hidden ? 'is-hidden' : ''}`}>
      {hidden ? (
        <button
          type="button"
          className={`cat-home-button ${restoring ? 'restoring' : ''}`}
          onClick={restoreCat}
          aria-label="Show cat remote"
        >
          <img src={homeFrames[homeFrameIndex]} alt="Show cat remote" className="cat-home-frame" />
        </button>
      ) : (
        <>
      <div className={`ctrl-buttons ${remoteOpen && !playing ? 'open' : ''}`}>
        <button type="button" className="ctrl-btn" onClick={moveToTop}>
          맨 위
        </button>
        <button type="button" className="ctrl-btn" onClick={moveToBottom}>
          맨 아래
        </button>
        {easterEggOpen && (
          <>
            <button type="button" className="ctrl-btn" onClick={feedCat}>
              Feed Cat
            </button>
            <button type="button" className="ctrl-btn" onClick={groomingCat}>
              Grooming
            </button>
          </>
        )}
        <button type="button" className="ctrl-btn" onClick={hideCat}>
          숨기기
        </button>
      </div>

      <button
        type="button"
        className={`cat-top-button ${remoteOpen ? 'open' : ''} ${playing ? 'playing' : ''} ${
          switchingFrameSet ? 'switching' : ''
        }`}
        onClick={handleRemoteClick}
        onDoubleClick={revealEasterEgg}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        aria-label="Open cat remote"
        aria-expanded={remoteOpen}
      >
        <img
          src={frames[frameIndex]}
          alt="Cat remote"
          className={`cat-frame ${
            frameSet === 'feed'
              ? 'feed-set'
              : frameSet === 'grooming'
                ? 'grooming-set'
                : frameSet === 'tail'
                  ? 'tail-set'
                  : frameSet === 'hide'
                    ? 'hide-set'
                    : 'sleep-set'
          } ${action === 'jumping' ? 'jumping' : ''} ${action === 'feeding' ? 'feeding' : ''} ${
            action === 'grooming' ? 'grooming' : ''
          } ${action === 'tailing' ? 'tailing' : ''} ${action === 'hiding' ? 'hiding' : ''} ${
            action === 'idle' ? 'breathe' : ''
          }`}
        />
      </button>
        </>
      )}
    </div>
  )
}
