import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/useAuthStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useFilterStore } from '@/stores/useFilterStore'
import { useAudioStore } from '@/stores/useAudioStore'
import { useTalkgroupColors, ColorRule, RuleMode } from '@/stores/useTalkgroupColors'
import { useSignalThresholds, type SignalThresholds } from '@/stores/useSignalThresholds'
import { useUpdateStore } from '@/stores/useUpdateStore'
import { APP_VERSION } from '@/version'
import { getSSEManager } from '@/api/eventsource'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { ColorPicker, getHexFromTailwind } from '@/components/ui/color-picker'
import { parseTalkgroupKey, isNewerVersion } from '@/lib/utils'

export default function Settings() {
  const writeToken = useAuthStore((s) => s.writeToken)
  const setWriteToken = useAuthStore((s) => s.setWriteToken)
  const user = useAuthStore((s) => s.user)
  const [tokenInput, setTokenInput] = useState('')
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)
  const favoriteTalkgroups = useFilterStore((s) => s.favoriteTalkgroups)
  const setFavoriteTalkgroups = useFilterStore((s) => s.setFavoriteTalkgroups)
  const showEncrypted = useFilterStore((s) => s.showEncrypted)
  const setShowEncrypted = useFilterStore((s) => s.setShowEncrypted)
  const emergencyNotifications = useFilterStore((s) => s.emergencyNotifications)
  const setEmergencyNotifications = useFilterStore((s) => s.setEmergencyNotifications)
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  const setUnitIdHex = useFilterStore((s) => s.setUnitIdHex)
  const autoPlay = useAudioStore((s) => s.autoPlay)
  const setAutoPlay = useAudioStore((s) => s.setAutoPlay)
  const volume = useAudioStore((s) => s.volume)
  const setVolume = useAudioStore((s) => s.setVolume)

  // Signal quality thresholds
  const signalThresholds = useSignalThresholds()
  const setThreshold = useSignalThresholds((s) => s.setThreshold)
  const resetSignalThresholds = useSignalThresholds((s) => s.resetToDefaults)

  // Update check
  const updateCheckEnabled = useUpdateStore((s) => s.updateCheckEnabled)
  const hasCheckedOnce = useUpdateStore((s) => s.hasCheckedOnce)
  const latestVersion = useUpdateStore((s) => s.latestVersion)
  const lastChecked = useUpdateStore((s) => s.lastChecked)
  const setUpdateCheckEnabled = useUpdateStore((s) => s.setUpdateCheckEnabled)

  // Talkgroup color rules
  const colorRules = useTalkgroupColors((s) => s.rules)
  const addRule = useTalkgroupColors((s) => s.addRule)
  const updateRule = useTalkgroupColors((s) => s.updateRule)
  const deleteRule = useTalkgroupColors((s) => s.deleteRule)
  const moveRule = useTalkgroupColors((s) => s.moveRule)
  const resetToDefaults = useTalkgroupColors((s) => s.resetToDefaults)
  const overrides = useTalkgroupColors((s) => s.overrides)
  const setOverride = useTalkgroupColors((s) => s.setOverride)
  const clearAllOverrides = useTalkgroupColors((s) => s.clearAllOverrides)
  const overrideCount = Object.keys(overrides).length
  const overrideEntries = Object.entries(overrides)

  // Drag and drop state for rule reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [newRule, setNewRule] = useState<ColorRule>({
    label: '',
    keywords: [],
    color: 'blue-500',
    mode: 'color',
  })
  const [newKeywords, setNewKeywords] = useState('')

  const RULE_MODES: { value: RuleMode; label: string; description: string }[] = [
    { value: 'color', label: 'Color', description: 'Color border' },
    { value: 'highlight', label: 'Highlight', description: 'Prominent display' },
    { value: 'hide', label: 'Hide', description: 'Filter out' },
  ]

  const handleReconnect = () => {
    const sse = getSSEManager()
    sse.reconnect()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your dashboard preferences</p>
      </div>

      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>SSE connection to tr-engine backend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-success'
                    : connectionStatus === 'connecting'
                      ? 'bg-warning animate-pulse'
                      : 'bg-destructive'
                }`}
              />
              <span className="capitalize">{connectionStatus}</span>
            </div>
            <Button variant="outline" onClick={handleReconnect}>
              Reconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Write Access */}
      <Card>
        <CardHeader>
          <CardTitle>Write Access</CardTitle>
          <CardDescription>
            {user ? (
              <>Write access is determined by your user role. You are logged in as <strong>{user.username}</strong> with role <strong>{user.role}</strong>.</>
            ) : (
              <>Enter the WRITE_TOKEN from your tr-engine config to enable editing talkgroups and units</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {user ? (
            <div className="flex items-center gap-2">
              <Badge
                variant="default"
                className={
                  user.role === 'admin' || user.role === 'editor'
                    ? 'bg-success/20 text-success'
                    : 'bg-muted text-muted-foreground'
                }
              >
                {user.role === 'admin' || user.role === 'editor' ? 'Write Enabled' : 'Read Only'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {user.role === 'viewer'
                  ? 'Contact an admin to upgrade your role for write access.'
                  : `${user.role} role grants write access to the API.`}
              </span>
            </div>
          ) : writeToken ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-success/20 text-success">Configured</Badge>
                <span className="text-sm text-muted-foreground font-mono">
                  {writeToken.slice(0, 8)}...
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWriteToken('')
                  setTokenInput('')
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste write token"
                className="flex-1 h-9 font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tokenInput.trim()) {
                    setWriteToken(tokenInput.trim())
                    setTokenInput('')
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (tokenInput.trim()) {
                    setWriteToken(tokenInput.trim())
                    setTokenInput('')
                  }
                }}
                disabled={!tokenInput.trim()}
              >
                Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audio settings */}
      <Card>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
          <CardDescription>Playback preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-play next call</p>
              <p className="text-sm text-muted-foreground">
                Automatically play the next call in queue when current ends
              </p>
            </div>
            <Button
              variant={autoPlay ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoPlay(!autoPlay)}
            >
              {autoPlay ? 'On' : 'Off'}
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Default volume</p>
              <p className="text-sm text-muted-foreground">
                Current: {Math.round(volume * 100)}%
              </p>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>

      {/* Display settings */}
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>What to show in the interface</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Show encrypted calls</p>
              <p className="text-sm text-muted-foreground">
                Display calls that are encrypted (no audio available)
              </p>
            </div>
            <Button
              variant={showEncrypted ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowEncrypted(!showEncrypted)}
            >
              {showEncrypted ? 'Shown' : 'Hidden'}
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Emergency notifications</p>
              <p className="text-sm text-muted-foreground">
                Show browser notification when an emergency call starts
                {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                  <span className="block text-destructive">Browser notifications are blocked. Allow them in your browser settings.</span>
                )}
              </p>
            </div>
            <Button
              variant={emergencyNotifications ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                const next = !emergencyNotifications
                if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                  Notification.requestPermission()
                }
                setEmergencyNotifications(next)
              }}
            >
              {emergencyNotifications ? 'On' : 'Off'}
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Unit IDs as hexadecimal</p>
              <p className="text-sm text-muted-foreground">
                Display unit radio IDs in hex (for MDC1200/FleetSync systems)
              </p>
            </div>
            <Button
              variant={unitIdHex ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUnitIdHex(!unitIdHex)}
            >
              {unitIdHex ? 'Hex' : 'Decimal'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Signal Quality Thresholds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Signal Quality Thresholds</CardTitle>
              <CardDescription>
                Set thresholds for color-coding signal quality on call detail pages
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={resetSignalThresholds} className="gap-1">
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm items-center">
              <span />
              <span className="text-center text-xs text-muted-foreground w-24">Good <span className="text-green-400">(green)</span></span>
              <span className="text-center text-xs text-muted-foreground w-24">Poor <span className="text-red-400">(red)</span></span>
            </div>
            {([
              { label: 'Signal (dB)', goodKey: 'signalGood', poorKey: 'signalPoor' },
              { label: 'Noise (dB)', goodKey: 'noiseGood', poorKey: 'noisePoor' },
              { label: 'Errors', goodKey: 'errorsGood', poorKey: 'errorsPoor' },
              { label: 'Spikes', goodKey: 'spikesGood', poorKey: 'spikesPoor' },
            ] as { label: string; goodKey: keyof SignalThresholds; poorKey: keyof SignalThresholds }[]).map(({ label, goodKey, poorKey }) => (
              <div key={goodKey} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <span className="text-sm font-medium">{label}</span>
                <Input
                  type="number"
                  value={signalThresholds[goodKey]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setThreshold(goodKey, v) }}
                  className="w-24 h-8 text-center font-mono"
                />
                <Input
                  type="number"
                  value={signalThresholds[poorKey]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setThreshold(poorKey, v) }}
                  className="w-24 h-8 text-center font-mono"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Signal: higher is better. Noise/Errors/Spikes: lower is better. Values between thresholds show as <span className="text-yellow-400">yellow</span>.
          </p>
        </CardContent>
      </Card>

      {/* Talkgroup Colors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Talkgroup Colors</CardTitle>
              <CardDescription>
                Color-code talkgroups based on keywords in their tag or group name
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              className="gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing rules - drag to reorder */}
          <div className="space-y-1">
            {colorRules.map((rule, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
                    moveRule(dragIndex, dragOverIndex)
                  }
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverIndex(index)
                }}
                onDragLeave={() => setDragOverIndex(null)}
                className={`flex items-center gap-2 rounded-lg border p-2 transition-all ${
                  dragIndex === index ? 'opacity-50 scale-95' : ''
                } ${
                  dragOverIndex === index && dragIndex !== index
                    ? 'border-primary border-2 bg-primary/5'
                    : ''
                }`}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="5" r="1" fill="currentColor" />
                    <circle cx="9" cy="12" r="1" fill="currentColor" />
                    <circle cx="9" cy="19" r="1" fill="currentColor" />
                    <circle cx="15" cy="5" r="1" fill="currentColor" />
                    <circle cx="15" cy="12" r="1" fill="currentColor" />
                    <circle cx="15" cy="19" r="1" fill="currentColor" />
                  </svg>
                </div>
                {rule.mode !== 'hide' ? (
                  <div
                    className={`h-4 w-4 rounded shrink-0 ${rule.mode === 'highlight' ? 'ring-2 ring-offset-1' : ''}`}
                    style={{
                      backgroundColor: resolveColor(rule.color),
                      ...(rule.mode === 'highlight' ? { '--tw-ring-color': resolveColor(rule.color) } as React.CSSProperties : {}),
                    }}
                  />
                ) : (
                  <div className="h-4 w-4 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0">
                    ✕
                  </div>
                )}
                <Input
                  value={rule.label}
                  onChange={(e) =>
                    updateRule(index, { ...rule, label: e.target.value })
                  }
                  className="w-24 h-8"
                  placeholder="Label"
                />
                <Input
                  value={rule.keywords.join(', ')}
                  onChange={(e) =>
                    updateRule(index, {
                      ...rule,
                      keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
                    })
                  }
                  className="flex-1 h-8"
                  placeholder="Keywords (comma-separated)"
                />
                <select
                  value={rule.mode}
                  onChange={(e) =>
                    updateRule(index, { ...rule, mode: e.target.value as RuleMode })
                  }
                  className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
                >
                  {RULE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {rule.mode !== 'hide' && (
                  <ColorPicker
                    value={rule.color}
                    onChange={(color) => updateRule(index, { ...rule, color })}
                  />
                )}
                {rule.mode === 'hide' && <div className="w-10" />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteRule(index)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Add new rule */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Add New Rule</p>
            <div className="flex items-center gap-3">
              {newRule.mode !== 'hide' ? (
                <div
                  className={`h-4 w-4 rounded ${newRule.mode === 'highlight' ? 'ring-2 ring-offset-1' : ''}`}
                  style={{
                    backgroundColor: resolveColor(newRule.color),
                    ...(newRule.mode === 'highlight' ? { '--tw-ring-color': resolveColor(newRule.color) } as React.CSSProperties : {}),
                  }}
                />
              ) : (
                <div className="h-4 w-4 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                  ✕
                </div>
              )}
              <Input
                value={newRule.label}
                onChange={(e) => setNewRule({ ...newRule, label: e.target.value })}
                className="w-24 h-8"
                placeholder="Label"
              />
              <Input
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                className="flex-1 h-8"
                placeholder="Keywords (comma-separated)"
              />
              <select
                value={newRule.mode}
                onChange={(e) => setNewRule({ ...newRule, mode: e.target.value as RuleMode })}
                className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
              >
                {RULE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {newRule.mode !== 'hide' && (
                <ColorPicker
                  value={newRule.color}
                  onChange={(color) => setNewRule({ ...newRule, color })}
                />
              )}
              {newRule.mode === 'hide' && <div className="w-10" />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newRule.label && newKeywords) {
                    addRule({
                      ...newRule,
                      keywords: newKeywords.split(',').map((k) => k.trim()).filter(Boolean),
                    })
                    setNewRule({ label: '', keywords: [], color: 'blue-500', mode: 'color' })
                    setNewKeywords('')
                  }
                }}
                className="h-8 gap-1"
                disabled={!newRule.label || !newKeywords}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Drag rules to reorder. First matching rule wins. Keywords match whole words by default (case-insensitive).
            Use wildcards for partial matching: <code className="bg-muted px-1 rounded">fire*</code> (starts with), <code className="bg-muted px-1 rounded">*osp</code> (ends with), <code className="bg-muted px-1 rounded">*med*</code> (contains).
            <br />
            <strong>Color:</strong> Border color indicator. <strong>Highlight:</strong> Prominent ring effect. <strong>Hide:</strong> Filter out from talkgroup list.
          </p>

          {overrideCount > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Per-Talkgroup Overrides</p>
                    <p className="text-xs text-muted-foreground">
                      {overrideCount} talkgroup{overrideCount !== 1 ? 's' : ''} with custom visibility settings
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllOverrides}
                    className="gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear All
                  </Button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {overrideEntries.map(([key, override]) => {
                    const parsed = parseTalkgroupKey(key)
                    const systemId = parsed?.systemId ?? 0
                    const tgid = parsed?.tgid ?? 0
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded border p-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {override.mode === 'hide' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">Hidden</span>
                          ) : override.mode === 'highlight' ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded text-white shrink-0"
                              style={{ backgroundColor: resolveColor(override.color || 'amber-500') }}
                            >
                              Highlight
                            </span>
                          ) : (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded text-white shrink-0"
                              style={{ backgroundColor: resolveColor(override.color || 'slate-500') }}
                            >
                              Color
                            </span>
                          )}
                          <span className="font-mono text-xs">{key}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOverride(systemId, tgid, null)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Favorites */}
      <Card>
        <CardHeader>
          <CardTitle>Favorite Talkgroups</CardTitle>
          <CardDescription>
            Quick access talkgroups shown in the sidebar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {favoriteTalkgroups.length === 0 ? (
            <p className="text-muted-foreground">
              No favorite talkgroups. Star talkgroups from the Talkgroups page to add them here.
            </p>
          ) : (
            <div className="space-y-2">
              {favoriteTalkgroups.map((tgKey) => (
                <div
                  key={tgKey}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="font-mono">{tgKey}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFavoriteTalkgroups(favoriteTalkgroups.filter((t) => t !== tgKey))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle>Keyboard Shortcuts</CardTitle>
          <CardDescription>Quick navigation and playback controls</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <ShortcutItem label="Command Palette" keys={['Ctrl', 'K']} />
            <ShortcutItem label="Toggle Sidebar" keys={['[']} />
            <ShortcutItem label="Play/Pause" keys={['Space']} />
            <ShortcutItem label="Skip Next" keys={['J']} />
            <ShortcutItem label="Skip Previous" keys={['K']} />
            <ShortcutItem label="Seek Forward" keys={['L']} />
            <ShortcutItem label="Seek Backward" keys={['H']} />
            <ShortcutItem label="Replay" keys={['R']} />
            <ShortcutItem label="Mute/Unmute" keys={['M']} />
            <ShortcutItem label="Volume Up" keys={['↑']} />
            <ShortcutItem label="Volume Down" keys={['↓']} />
            <ShortcutItem label="Go to Dashboard" keys={['G', 'D']} />
            <ShortcutItem label="Go to Calls" keys={['G', 'C']} />
            <ShortcutItem label="Go to Talkgroups" keys={['G', 'T']} />
            <ShortcutItem label="Go to Units" keys={['G', 'U']} />
            <ShortcutItem label="Go to Affiliations" keys={['G', 'A']} />
            <ShortcutItem label="Go to Directory" keys={['G', 'R']} />
            <ShortcutItem label="Go to Settings" keys={['G', 'S']} />
            <ShortcutItem label="Go to Admin" keys={['G', 'X']} />
          </div>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>Automatic update checking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Check for updates</p>
              <p className="text-sm text-muted-foreground">
                Ping update server on startup to check for new versions
              </p>
            </div>
            <Button
              variant={updateCheckEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUpdateCheckEnabled(!updateCheckEnabled)}
              disabled={!hasCheckedOnce}
              title={!hasCheckedOnce ? 'Waiting for first update check to complete' : undefined}
            >
              {updateCheckEnabled ? 'On' : 'Off'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Current version: <span className="font-mono text-foreground">v{APP_VERSION}</span></p>
            {latestVersion && (
              <p>Latest version: <span className="font-mono text-foreground">v{latestVersion}</span>
                {isNewerVersion(APP_VERSION, latestVersion) && (
                  <Badge variant="warning" className="ml-2 text-[10px] px-1.5 py-0">Update available</Badge>
                )}
              </p>
            )}
            {lastChecked && (
              <p>Last checked: {new Date(lastChecked).toLocaleString()}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            tr-dashboard is a modern frontend for the tr-engine radio scanning backend.
            It provides real-time monitoring and historical analysis of trunk-recorder radio systems.
          </p>
          <div className="mt-4 flex gap-2">
            <Badge variant="outline">React 19</Badge>
            <Badge variant="outline">TypeScript</Badge>
            <Badge variant="outline">Tailwind CSS</Badge>
            <Badge variant="outline">Zustand</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ShortcutItem({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="rounded border bg-muted px-2 py-1 font-mono text-xs"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}

// Alias for getHexFromTailwind for local use
const resolveColor = getHexFromTailwind
