import { ConnectionBadge } from '../components/ConnectionBadge'
import { Panel } from '../components/ui/Panel'
import { Toggle } from '../components/ui/Toggle'
import { useUiStore } from '../store/uiStore'

export function SettingsView() {
  const settings = useUiStore((state) => state.settings)
  const update = useUiStore((state) => state.updateSettings)

  return (
    <div className="grid max-w-3xl gap-4">
      <Panel title="Display">
        <div className="divide-y divide-line">
          <Toggle
            label="Show coordinates"
            description="Column letters and row numbers around the grid."
            checked={settings.showCoordinates}
            onChange={(showCoordinates) => update({ showCoordinates })}
          />
          <Toggle
            label="Reduce motion"
            description="Turns off capture and highlight animations. Your system setting is respected too."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </div>
        <p className="mt-3 text-xs text-muted">Saved on this device only.</p>
      </Panel>
      <Panel title="Connection">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Live updates</span>
          <ConnectionBadge />
        </div>
      </Panel>
    </div>
  )
}
