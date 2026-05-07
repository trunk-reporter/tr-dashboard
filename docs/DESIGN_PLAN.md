# tr-dashboard Design Plan

## Focused Design Specs

- [Talkgroup and Unit Directory Experience](talkgroup-unit-directory-experience.md)

---

## Selected Design: Option C - Hybrid Scanner

We are implementing Option C as the primary design. Options A and B are preserved below for potential future implementation or as alternative themes.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React 18 + TypeScript | Best ecosystem support, strong with real-time state |
| Build Tool | Vite | Fast dev server, excellent DX, easy config |
| Styling | Tailwind CSS | Rapid iteration, consistent design system |
| Components | shadcn/ui (Radix primitives) | Accessible, customizable, we own the code |
| State | Zustand | Lightweight, great for real-time data, no boilerplate |
| Routing | React Router v6 | Standard, flexible, supports nested layouts |
| Shortcuts | react-hotkeys-hook + cmdk | Global shortcuts + command palette |
| Audio | Native HTML5 Audio API | Range requests, seeking, simple |

---

## Project Structure

```
src/
├── api/
│   ├── client.ts           # Fetch wrapper, base URL config
│   ├── websocket.ts        # WebSocket connection manager
│   ├── hooks/              # React Query or custom hooks
│   │   ├── useSystems.ts
│   │   ├── useTalkgroups.ts
│   │   ├── useCalls.ts
│   │   └── useUnits.ts
│   └── types.ts            # TypeScript interfaces (from MODELS.md)
├── components/
│   ├── ui/                 # shadcn/ui components (Button, Dialog, etc.)
│   ├── audio/
│   │   ├── AudioPlayer.tsx        # Main player with waveform
│   │   └── TransmissionTimeline.tsx
│   ├── calls/
│   │   ├── CallCard.tsx
│   │   ├── CallList.tsx
│   │   └── ActiveCallBadge.tsx
│   ├── talkgroups/
│   │   ├── TalkgroupCard.tsx
│   │   └── TalkgroupList.tsx
│   ├── units/
│   │   ├── UnitBadge.tsx
│   │   └── UnitActivityFeed.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── MainLayout.tsx
│   └── command/
│       └── CommandPalette.tsx     # cmdk integration
├── pages/
│   ├── Dashboard.tsx       # Real-time overview
│   ├── Calls.tsx           # Call history browser
│   ├── Talkgroups.tsx      # Talkgroup management
│   ├── Units.tsx           # Unit browser
│   ├── CallDetail.tsx      # Single call view
│   └── Settings.tsx
├── stores/
│   ├── useAudioStore.ts    # Playback state, queue
│   ├── useRealtimeStore.ts # WebSocket data (active calls, events)
│   └── useFilterStore.ts   # Current filters, search
├── hooks/
│   ├── useKeyboardShortcuts.ts
│   └── useAudioPlayer.ts
├── lib/
│   ├── utils.ts            # Helpers (formatFrequency, formatDuration)
│   └── constants.ts
└── App.tsx
```

---

## Core Architecture Patterns

### WebSocket Management

```typescript
// Singleton connection with auto-reconnect
// Zustand store receives events and updates state
// Components subscribe to slices of state they need

const useRealtimeStore = create((set, get) => ({
  activeCalls: [],
  recentCalls: [],
  unitEvents: [],
  decodeRates: {},

  // WebSocket event handlers
  handleCallStart: (data) => set(state => ({
    activeCalls: [...state.activeCalls, data]
  })),
  handleCallEnd: (data) => set(state => ({
    activeCalls: state.activeCalls.filter(c => c.talkgroup !== data.talkgroup),
    recentCalls: [data, ...state.recentCalls].slice(0, 100)
  })),
  // ...
}));
```

### Audio Playback

- Global audio player fixed at bottom of screen
- Queue system for continuous playback
- Keyboard shortcuts (Space, J/K, M)
- Visual transmission timeline showing who spoke when

### Routing Structure

```
/                     → Dashboard (real-time overview)
/calls                → Call history with filters
/calls/:id            → Call detail with audio + transmissions
/talkgroups           → Talkgroup browser
/talkgroups/:id       → Talkgroup detail + recent calls
/units                → Unit browser
/units/:id            → Unit detail + event history
/settings             → Preferences, WebSocket status
```

---

## UI Design Options

### Option C: "Hybrid Scanner" (SELECTED)

Dense like a console but with modern aesthetics. Collapsible sidebar, split-pane layout, keyboard-driven.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ tr-dashboard     [⌘K]     ● 2 Systems │ 5 Active │ 98.5%      ☾    ≡    │
├──────────┬──────────────────────────────────────────────────────────────────┤
│          │                                                                  │
│ MONITOR  │  ┌─ LIVE ──────────────────────────────────────────────────────┐ │
│ ────────┐│  │                                                             │ │
│ □ All   ││  │  ┌───────────────────────────────┐ ┌──────────────────────┐ │ │
│ ■ Metro ││  │  │ ● PD Dispatch          00:34  │ │ ● Fire Tac 2   00:12 │ │ │
│ □ County││  │  │                               │ │                      │ │ │
│          │  │  │   ▂▄▆█▆▄▂▁▂▄▆█▆▄▂▁▂▄▆█▆▄▂▁   │ │   ▂▄▆█▆▄▂▁▂▄▆█▆     │ │ │
│ FAVORITES│  │  │                               │ │                      │ │ │
│ ────────┐│  │  │   4521 ━━━━━━━━○━━━━━━━━━━   │ │   1102 ━━━━━━━━━━━   │ │ │
│ ★ PD Dsp││  │  │   892  ━━━○━━━━━━━━━━━━━━━   │ │                      │ │ │
│ ★ Fire  ││  │  └───────────────────────────────┘ └──────────────────────┘ │ │
│ ★ EMS   ││  │                                                             │ │
│ + Add   ││  └─────────────────────────────────────────────────────────────┘ │
│          │                                                                  │
│ UNITS    │  ┌─ RECENT ───────────────────────────────────────── [F]ilter ─┐ │
│ ────────┐│  │                                                             │ │
│ 4521 ●  ││  │  14:32   PD Dispatch      4521,892        0:45    ▶   ⋯    │ │
│ 1102 ●  ││  │  14:31   Fire Tac 1       1102,1103       1:23    ▶   ⋯    │ │
│ 892  ●  ││  │  14:28   EMS Ops          2201            0:18    ▶   ⋯    │ │
│ 3301 ○  ││  │  14:25   PD Dispatch      4521,892,445    2:01    ▶   ⋯    │ │
│ 2201 ○  ││  │  14:22   PD Tac 2         4601            0:33    ▶   ⋯    │ │
│          │  │                                                             │ │
├──────────┴──┴─────────────────────────────────────────────────────────────┴─┤
│                                                                             │
│   ▶ ▁▂▃▅▆█▇▅▃▂▁▂▄▆█▇▅▃▂░░░░░░░░░░░░░░░░░░░░░   0:24 / 0:45   🔊━━━━━○     │
│     └─4521─┘ └892┘                                           [J][K][Space] │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Collapsible left sidebar (toggle with `[` key)
- System selector, favorites, active units in sidebar
- Main area split: live calls top, recent calls bottom (resizable)
- Live calls show mini waveform and unit activity bars
- Recent calls as compact table with inline play
- Audio player shows transmission segments visually
- Keyboard shortcut hints visible
- Dark theme default, optimized for extended use

---

### Option A: "Scanner Console" (ALTERNATIVE)

Inspired by professional dispatch consoles and SDR software. Maximum information density, dark theme, multiple panels visible at once.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  tr-dashboard                              ⌘K Search    ● Connected    ≡    │
├────────────────────┬────────────────────────────────────────────────────────┤
│                    │  ACTIVE CALLS                                          │
│  SYSTEMS           │  ┌─────────────────────────────────────────────────┐   │
│  ┌──────────────┐  │  │ ● PD Dispatch        00:34   🔴 LIVE            │   │
│  │ ● Metro      │  │  │   Unit 4521 → Unit 892                          │   │
│  │   98.5% ████ │  │  ├─────────────────────────────────────────────────┤   │
│  │   5 active   │  │  │ ● Fire Tac 2         00:12   🔴 LIVE            │   │
│  └──────────────┘  │  │   Unit 1102                                     │   │
│                    │  └─────────────────────────────────────────────────┘   │
│  TALKGROUPS        │                                                        │
│  ┌──────────────┐  │  RECENT CALLS                                          │
│  │ ★ PD Dispatch│  │  ┌────────┬─────────────┬────────┬─────────┬──────┐   │
│  │ ★ Fire Disp  │  │  │ Time   │ Talkgroup   │ Units  │ Duration│ ▶    │   │
│  │   EMS Tac 1  │  │  ├────────┼─────────────┼────────┼─────────┼──────┤   │
│  │   PD Tac 2   │  │  │ 14:32  │ PD Dispatch │ 3      │ 0:45    │ ▶    │   │
│  │   ...        │  │  │ 14:31  │ Fire Tac 1  │ 2      │ 1:23    │ ▶    │   │
│  └──────────────┘  │  │ 14:28  │ EMS Ops     │ 1      │ 0:18    │ ▶    │   │
│                    │  │ 14:25  │ PD Dispatch │ 4      │ 2:01    │ ▶    │   │
│  UNIT ACTIVITY     │  └────────┴─────────────┴────────┴─────────┴──────┘   │
│  ┌──────────────┐  │                                                        │
│  │ 4521 → PD Di │  ├────────────────────────────────────────────────────────┤
│  │ 1102 → Fire  │  │  ▶ ║████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 0:34/1:45 │
│  │ 892  joined  │  │    ├─4521──┤├─892─┤    ├──4521──┤                      │
│  │ 3301 off     │  │  ◀◀   ▶▶   🔊━━━━━━○                  [J] [K] [Space] │
│  └──────────────┘  └────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Dark theme (reduces eye strain during long monitoring sessions)
- Sidebar with system health, favorite talkgroups, live unit feed
- Main area shows active calls prominently, recent calls below
- Persistent audio player at bottom with transmission timeline
- Dense but organized - everything visible without navigation

---

### Option B: "Modern Dashboard" (ALTERNATIVE)

Inspired by modern analytics dashboards (Linear, Vercel). Spacious, card-based, light/dark mode support, focus on clarity.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ◉ tr-dashboard              [━━━━━━━━━ Search ⌘K ━━━━━━━━━]      ☀ ▣ ≡    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Active Calls   │  │  Calls/Hour     │  │  Systems        │            │
│   │      ◉ 5        │  │     ▲ 127       │  │    2 Online     │            │
│   │                 │  │   ███████       │  │    ● ● ○        │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
│   Live Activity ─────────────────────────────────────────────────────────   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🔴  PD Dispatch                                             00:34  │   │
│   │      Unit 4521 transmitting                            850.387 MHz  │   │
│   │      ▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁  ←── live waveform                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🔴  Fire Tac 2                                              00:12  │   │
│   │      Unit 1102 transmitting                            851.225 MHz  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Recent ────────────────────────────────────────────────────── View All →  │
│                                                                             │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐  │
│   │ PD Dispatch   │ │ Fire Tac 1    │ │ EMS Ops       │ │ PD Tac 2      │  │
│   │ 0:45 • 3 units│ │ 1:23 • 2 units│ │ 0:18 • 1 unit │ │ 0:33 • 2 units│  │
│   │ 2 min ago   ▶ │ │ 3 min ago   ▶ │ │ 5 min ago   ▶ │ │ 7 min ago   ▶ │  │
│   └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ▶ │▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅│ 0:00 / 0:45   PD Dispatch        🔊 ━━━━○    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Clean, spacious layout with generous whitespace
- Stats cards at top for quick overview
- Active calls as prominent cards with live indicators
- Horizontal scroll for recent calls (touch-friendly)
- Light/dark mode toggle
- Minimal chrome, content-focused

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Initialize Vite + React + TypeScript
- [ ] Configure Tailwind CSS
- [ ] Install and configure shadcn/ui
- [ ] Set up project structure
- [ ] Create TypeScript types from API MODELS.md
- [ ] Build API client (REST + WebSocket)
- [ ] Create Zustand stores (realtime, audio, filters)

### Phase 2: Core Layout
- [ ] MainLayout with collapsible sidebar
- [ ] Header with search trigger and status indicators
- [ ] Sidebar with system selector, favorites, unit feed
- [ ] Audio player bar with basic playback

### Phase 3: Real-time Features
- [ ] WebSocket connection with auto-reconnect
- [ ] Active calls display with live updates
- [ ] Unit activity feed
- [ ] System health indicators (decode rate)

### Phase 4: Call Management
- [ ] Recent calls list with filtering
- [ ] Call detail page with transmissions
- [ ] Audio player with transmission timeline
- [ ] Call history browser with pagination

### Phase 5: Navigation & Search
- [ ] React Router setup
- [ ] Talkgroup browser
- [ ] Unit browser
- [ ] Command palette (cmdk) integration
- [ ] Keyboard shortcuts

### Phase 6: Polish
- [ ] Dark/light theme toggle
- [ ] Responsive design (mobile sidebar)
- [ ] Settings page
- [ ] Error handling and loading states
- [ ] Performance optimization

---

## Keyboard Shortcuts (Planned)

| Key | Action |
|-----|--------|
| `Space` | Play/pause audio |
| `J` | Previous call |
| `K` | Next call |
| `M` | Mute/unmute |
| `[` | Toggle sidebar |
| `⌘K` / `Ctrl+K` | Open command palette |
| `F` | Focus filter/search |
| `Esc` | Close dialogs/panels |
| `?` | Show keyboard shortcuts |

---

## Color Palette (Dark Theme)

```
Background:     #0a0a0b (near black)
Surface:        #141416 (cards, panels)
Surface Hover:  #1c1c1f
Border:         #27272a (subtle dividers)
Text Primary:   #fafafa
Text Secondary: #a1a1aa
Text Muted:     #71717a

Accent Blue:    #3b82f6 (links, active states)
Live Red:       #ef4444 (live indicators)
Success Green:  #22c55e (online, good signal)
Warning Amber:  #f59e0b (degraded, encrypted)
Emergency Red:  #dc2626 (emergency calls)
```

---

## Files to Create (Phase 1)

```
package.json
vite.config.ts
tailwind.config.js
tsconfig.json
src/
├── main.tsx
├── App.tsx
├── index.css
├── api/
│   ├── client.ts
│   ├── websocket.ts
│   └── types.ts
├── stores/
│   ├── useRealtimeStore.ts
│   └── useAudioStore.ts
└── components/
    └── ui/           # shadcn components added as needed
```
