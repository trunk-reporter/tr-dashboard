# UI Pattern Library

This document catalogs shared UI primitives used across monitoring surfaces in tr-dashboard. All components live in `src/components/ui/` and are designed to be API-shape-agnostic (no direct API type dependencies).

---

## Theme Tokens (`src/index.css`)

All colours, radii, and spacing use CSS custom properties overridden per theme (`[data-theme="dark|amber|high-contrast|light"]`).

### Semantic Colour Tokens
| Token | Purpose |
|-------|---------|
| `--color-success` | Healthy/connected/good state |
| `--color-warning` | Degraded/marginal state |
| `--color-destructive` | Error/critical/offline state |
| `--color-info` | Informational highlight |
| `--color-live` | Active/recording/live broadcast |
| `--color-primary` | Amber accent, interactive focus |
| `--color-muted-foreground` | Secondary text, disabled hints |

### Elevation / Shadow Tokens
| Token | When to use |
|-------|------------|
| `--shadow-card` | Standard card surface |
| `--shadow-elevated` | Hover-lifted or floating surface |
| `--shadow-glow` | Amber glow for focus / active card |
| `--shadow-recessed` | Inactive / pressed state |

### Animation Duration Tokens
| Token | Value | When to use |
|-------|-------|------------|
| `--duration-fast` | 150ms | Hover colour changes, icon swaps |
| `--duration-normal` | 250ms | Panel entrances, toast animations |
| `--duration-slow` | 400ms | Page transitions, expand/collapse |

### Opacity Tokens
| Token | Value | When to use |
|-------|-------|------------|
| `--opacity-disabled` | 0.4 | Disabled controls |
| `--opacity-muted` | 0.6 | Placeholder or hint text |
| `--opacity-subtle` | 0.8 | Secondary icons |

---

## Shared Component Primitives

### EmptyState
`src/components/ui/empty-state.tsx`

Use whenever a data collection is empty — calls list, search results, filter results.

```tsx
<EmptyState
  icon={<MicrophoneIcon />}
  title="No calls match filters"
  description="Try adjusting your filter selection"
  action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>}
/>
```

**Props**
| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `title` | `string` | ✓ | Primary message |
| `description` | `string` | — | Secondary hint text |
| `icon` | `ReactNode` | — | Rendered at 0.4 opacity inside a wrapper |
| `action` | `ReactNode` | — | CTA button or link |
| `className` | `string` | — | Extra Tailwind classes |

---

### ErrorPanel
`src/components/ui/error-panel.tsx`

Use when a fetch or action fails and needs visible in-page feedback.

```tsx
<ErrorPanel
  title="Failed to load calls"
  message={error.message}
  onRetry={refetch}
/>
```

**Props**
| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `message` | `string` | ✓ | Human-readable error description |
| `title` | `string` | — | Defaults to "Something went wrong" |
| `onRetry` | `() => void` | — | Renders a Retry button when provided |
| `className` | `string` | — | Extra Tailwind classes |

---

### Banner
`src/components/ui/banner.tsx`

Inline contextual alert bar. Use for time-window notices, maintenance warnings, emergency notices, or feature announcements. Prefer `Banner` over one-off inline divs with hardcoded border-color classes.

```tsx
<Banner variant="info" action={<Button size="sm" onClick={clearWindow}>Show latest</Button>}>
  Showing ±4 hours around {new Date(aroundTime).toLocaleString()}
</Banner>

<Banner variant="error" onDismiss={() => setError(null)}>
  Backend is unreachable — data may be stale
</Banner>
```

**Variants:** `info` | `success` | `warning` | `error`

**Props**
| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `children` | `ReactNode` | ✓ | Main message content |
| `variant` | `BannerVariant` | — | Defaults to `"info"` |
| `icon` | `ReactNode` | — | Leading icon or badge |
| `action` | `ReactNode` | — | Trailing action (button, link) |
| `onDismiss` | `() => void` | — | Renders ✕ dismiss button when provided |
| `className` | `string` | — | Extra Tailwind classes |

---

### FilterChip
`src/components/ui/filter-chip.tsx`

Toggle pill for filter bars. Replaces inline `<button className={cn(...)}>` patterns. Supports three colour variants matching semantic filter categories.

```tsx
<FilterChip active={filterFavorites} variant="amber" onClick={toggle}>Favorites</FilterChip>
<FilterChip active={filterEmergency} variant="destructive" onClick={toggle}>Emergency</FilterChip>
<FilterChip active={filterMonitored} onClick={toggle}>Monitored</FilterChip>
```

**Variants:** `default` (primary amber) | `amber` (hard amber) | `destructive` (red)

**Props:** extends `React.ButtonHTMLAttributes<HTMLButtonElement>`
| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `active` | `boolean` | — | Filled/active vs outlined/inactive |
| `variant` | `FilterChipVariant` | — | Defaults to `"default"` |

---

### ConnectionIndicator
`src/components/ui/connection-indicator.tsx`

Status dot + label badge for WebSocket/SSE connection state. Replaces `<Badge variant={status === 'connected' ? 'success' : 'secondary'}>` one-offs.

```tsx
<ConnectionIndicator status={connectionStatus} />
<ConnectionIndicator status="error" label="offline" />
```

**Statuses and visual mapping**
| Status | Dot colour | Animated |
|--------|-----------|---------|
| `connected` | `--color-success` (green) | No |
| `connecting` | `--color-warning` (orange) | Pulse |
| `disconnected` | `--color-muted-foreground` (slate) | No |
| `error` | `--color-destructive` (red) | Pulse |

**Props**
| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `status` | `'connected' \| 'connecting' \| 'disconnected' \| 'error'` | ✓ | |
| `label` | `string` | — | Overrides default status text |
| `className` | `string` | — | |

Compatible with `ConnectionStatus` from `@/api/eventsource`.

---

### Toast / ToastContainer
`src/components/ui/toast.tsx` + `src/stores/useToastStore.ts`

Transient notification system. `ToastContainer` is mounted once in `MainLayout`. Trigger toasts imperatively via `useToastStore`.

```tsx
// Trigger from anywhere
const { show } = useToastStore()
show('Settings saved', 'success')
show('Failed to save', 'error')
show('Export ready', 'default', 6000) // custom duration ms; 0 = sticky
```

**Variants:** `default` | `success` | `warning` | `error`

**`useToastStore` API**
| Method | Signature | Notes |
|--------|-----------|-------|
| `show` | `(message, variant?, duration?) => void` | Default: `'default'`, 4000ms |
| `dismiss` | `(id) => void` | Manual dismiss |
| `toasts` | `Toast[]` | Current visible toasts |

Toasts auto-dismiss after `duration` ms. Set `duration = 0` for sticky (must dismiss manually).

---

## Operational State Patterns

### Loading
Use `SkeletonCard` / `SkeletonRow` from `src/components/ui/skeleton.tsx` while data is fetching. Never show empty state during loading.

### Empty
Use `EmptyState` with an appropriate icon and hint text. Include a `action` if the user can do something (clear filters, navigate, retry).

### Error
Use `ErrorPanel` for in-place fetch errors with an optional retry action. Use `Banner` variant `"error"` for degraded-but-partial states (e.g., backend reachable but stale).

### Edge Cases
- **No audio**: disable play button, show greyed icon
- **Encrypted call**: show `<Badge variant="secondary">ENC</Badge>` inline
- **Emergency**: show `<Badge variant="destructive">!</Badge>` inline, use `FilterChip variant="destructive"` to filter
- **Zero results with active filter**: `EmptyState` with filter hint
- **Disconnected SSE**: `ConnectionIndicator status="disconnected"` or `"error"` in stats bar

---

## Surfaces Using Shared Patterns

| Surface | Type | Patterns Used |
|---------|------|---------------|
| Dashboard (`/`) | Live monitoring | `FilterChip`, `EmptyState`, `ConnectionIndicator` |
| Calls (`/calls`) | History/detail | `Banner` (time-window notice) |
| MainLayout | Global | `ToastContainer` |
