import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'

import { Toaster } from './components/Toaster'
import { GamePage } from './pages/GamePage'
import { WelcomePage } from './pages/WelcomePage'
import { controller } from './services/gameController'
import { useGameStore } from './store/gameStore'
import { initUi } from './store/uiStore'

export default function App() {
  const phase = useGameStore((state) => state.phase)

  useEffect(() => {
    void controller.bootstrap()
    return initUi()
  }, [])

  return (
    <>
      {phase === 'booting' ? (
        <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
          <LoaderCircle className="h-8 w-8 animate-spin text-brand" />
        </div>
      ) : phase === 'welcome' ? (
        <WelcomePage />
      ) : (
        <GamePage />
      )}
      <Toaster />
    </>
  )
}
