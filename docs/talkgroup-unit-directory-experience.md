# Talkgroup and Unit Directory Experience

Status: proposed for next-gen dashboard UI

Related work: dashboard IA, shared data/query layer, realtime/SSE foundation, live audio/player UX, and monitoring surface pattern library.

## Goal

Make talkgroups and units feel like one coherent directory for browsing, monitoring, customization, and investigation. The directory should preserve the dense Hybrid Scanner direction while making entity state easy to scan: what it is, where it belongs, how recently it was heard, whether it is active now, whether the operator cares about it, and how confident the metadata is.

## Information Architecture

Primary routes:

- `/talkgroups` - dense talkgroup list with filters, monitor/favorite/color controls, and quick analytics entry.
- `/talkgroups/:system_id::tgid` - talkgroup detail with live state, recent calls, affiliated/recent units, metadata, customization, and analytics.
- `/units` - dense unit list with activity, affiliation, and last-heard context.
- `/units/:system_id::unit_id` - unit detail with event timeline, recent calls, current/last affiliation, and related talkgroups.
- `/affiliations` - operational cross-reference of unit-to-talkgroup affiliations, linked from both directory sections.

Navigation placement:

- Directory sidebar group contains Talkgroups, Units, and Affiliations.
- Command palette searches talkgroups and units together. Results must show system, identifier, display name, and last-heard context so duplicate IDs across systems are distinguishable.
- Links from calls, timeline, transcription search, active call cards, and analytics preserve the current investigation filter state when practical.

## Shared List Pattern

Talkgroup and unit lists should use the same page shell:

- Compact title row with count, active filters, view selector, search, system filter, sort, and import/admin entry when permitted.
- URL-backed query state for search, filters, sort, page, and page size.
- Dense rows by default, not card grids. Rows should stay stable while live events update.
- Row click opens detail. Inline controls use icon buttons and must not trigger row navigation.
- Pagination is server-backed where available. Avoid fetching every entity for routine list views once backend filters support the needed facets.
- Empty states name the current filter combination and offer one clear reset action. Admin/write users may also see an import/add metadata action.

Shared row columns:

- Identity: display alias/name, numeric ID, and system name.
- State: live/active indicator, last-heard relative time, and activity level.
- Classification: group/tag/service type where present.
- Relationships: affiliated/current talkgroup for units; recent/top units for talkgroups when space allows.
- Controls: favorite, monitor, color/tag indicator, row overflow menu.

Density targets:

- Desktop rows: 36-44px tall for routine rows, 48px when extra badges are present.
- Laptop/narrow rows: collapse secondary fields behind truncation and tooltips, keeping identity, state, and primary control visible.
- Mobile: route-level tabs or stacked rows; no hover-only controls.

## Talkgroup List

Default sort should be `calls_24h desc`, with quick sort options for live/recent, alpha tag, TGID, call count, and unit count.

Filters:

- System
- Site when available
- Group
- Tag
- Mode: clear, encrypted, mixed, digital, analog/conventional where supported
- Activity: active now, heard in last hour, heard today, never heard
- Favorites
- Monitored
- Hidden/highlighted/color-rule state

Row content:

- Left color stripe from explicit talkgroup override or matching color rule.
- Primary label: alpha tag, falling back to `TG <tgid>`.
- Secondary label: description, group, or tag.
- Badges: system, group/tag, encrypted/mixed, live, favorite, monitored.
- Metrics: last heard, calls 1h/24h, total calls, distinct units.
- Actions: favorite star, monitor headphones/radio icon, color swatch, overflow.

Inline customization:

- Favorite and monitor are always visible. If the user lacks write/admin permission, these still work as local user preferences.
- Color override is a local preference unless/until server-backed user preferences exist.
- Metadata edit/import actions are permission-aware and shown in the overflow or page toolbar, not as noisy controls on every row.

## Unit List

Default sort should be `last_seen desc`, with quick toggles for All and Active.

Filters:

- System
- Site when available
- Search by unit ID, alpha tag, and alias
- Activity: active now, seen in last 10 minutes, seen today, stale, never seen
- Current/last talkgroup
- Event type: call, join/affiliate, deregister, emergency/signal
- Unit ID display: decimal/hex follows the global user preference

Row content:

- Primary label: alpha tag or `Unit <id>`, using the global unit ID format.
- Secondary label: numeric ID, system, and current/last talkgroup.
- State: active dot, last event type badge, last heard relative time.
- Metrics: event count in current realtime buffer and call count when available.
- Actions: favorite/follow if added later, overflow, direct link to related talkgroup.

Unit list should avoid implying certainty from sparse metadata. If a unit has only a RID and recent events, call it a unit ID, not a named unit.

## Detail Page Pattern

Talkgroup and unit detail pages should share a three-zone layout:

- Header: back link, name/ID, system/site, live state, favorite/monitor/customize controls, permission-aware edit button.
- Summary band: last heard, activity level, call/event counts, primary relationship, metadata confidence/source.
- Work area: tabs or sections for Activity, Calls, Relationships, Analytics, Metadata.

Header controls:

- Favorite: local preference; visible for all users.
- Monitor: local/session preference that affects live audio subscription and queue behavior.
- Color: local visual preference with reset option.
- Tags: server metadata if writable; local-only tags should be visually distinct until persistence is decided.
- Edit: visible but disabled with explanatory tooltip in read-only token mode, or hidden in pure viewer mode if auth-init can expose capability.

## Talkgroup Detail

Above the fold:

- Name, TGID, system, site coverage if known.
- Live call banner when active with a direct player/subscription affordance.
- Description, group, tag, mode/encryption state, priority.
- Last heard, calls 1h/24h/30d, active unit count, metadata source/confidence.

Main sections:

- Recent Calls: compact call list using the canonical history row pattern; play from here queues the visible filtered set.
- Units: affiliated units first, then recently heard units. Sort by activity, name, ID, or call count.
- Analytics: prominent link/card to `/talkgroups/:id/analytics` with 30-day activity, top units, keywords, and cross-reference.
- Metadata: editable fields, color override, aliases, import source, audit/source info.

## Unit Detail

Above the fold:

- Display name, unit ID, system, active state, last event badge, current/last talkgroup link.
- First seen, last seen, event count/call count, metadata source/confidence.
- Emergency or signal state gets a clear status banner when currently active or recently observed.

Main sections:

- Activity Timeline: unit events, affiliations, signals, and calls in one chronological stream.
- Recent Calls: calls involving the unit, with playback and drill-in.
- Talkgroups: current affiliation, recent talkgroups, and top talkgroups by activity.
- Metadata: editable alias/name, source, notes, import history.

Unit activity entry points:

- From unit detail, link to filtered Calls, Investigate timeline, and Transcription search with the unit preselected.
- From talkgroup detail, each unit row links to the unit detail and can open calls filtered to that unit plus talkgroup.

## Affiliation Experience

Affiliations are a relationship view, not a third unrelated directory.

- Default view: currently affiliated units grouped by talkgroup or system.
- Filters: system, talkgroup, unit, status, last updated.
- Row links go to both the unit and talkgroup detail pages.
- Summary shows unit counts per talkgroup and recently changed affiliations.
- Empty state distinguishes "no current affiliations" from "affiliation tracking unavailable for this system."

## Import and Admin Flows

Keep routine browsing clean for viewers, but make write/admin workflows discoverable.

Toolbar actions:

- Import talkgroup directory CSV
- Import/update unit aliases CSV
- Review unmatched/imported entries
- Bulk tag/color from selected rows

Permission behavior:

- Viewer/read-only: show local favorite, monitor, and color controls. Hide or disable server-write actions with concise copy.
- Write token: allow metadata edits and imports that map to normal write endpoints.
- Admin/JWT: allow destructive or broad operations such as system merge, bulk overwrite, and source-priority changes.

Import review:

- Preview changes before applying.
- Show matched system/entity key, existing value, incoming value, source, and confidence.
- Require explicit choice for duplicate TGIDs or unit IDs across systems.
- After import, link to filtered directory results for changed rows.

## Metadata Display Standards

Use consistent labels across lists and details:

- `Last heard` for last call/audio activity.
- `Last event` for unit signaling/affiliation events that may not include audio.
- `Active now` only when realtime active call/event state says it is current.
- `Activity` as a compact bucket: Live, Hot, Recent, Quiet, Stale, Unknown.
- `System` for the dashboard `system_id`/name entity.
- `P25 system ID` or `SysID` only when showing radio protocol identifiers.
- `Site` only when the event/call is site-specific.
- `Alias` or `Alpha tag` for user/imported names; do not call it `Name` when source confidence is low.

Metadata confidence:

- High: admin/user edited or imported from trusted directory.
- Medium: repeated backend observation or source with known quality.
- Low: inferred from recent calls/events only.
- Unknown: no source present.

Render confidence as small source text in detail pages and as a subtle icon/tooltip in lists. Do not overload badge color with confidence because color is already used for live, emergency, encryption, and custom talkgroup styling.

## Analog and P25 Differences

The UI should describe capabilities without forcing P25 vocabulary onto analog systems.

P25/digital:

- Talkgroup ID, unit RID, affiliation, emergency, encryption, source unit, site, NAC/sysid when available.
- Unit detail can emphasize affiliations and unit events.
- Talkgroup detail can show active/recent affiliated units and encryption stats.

Analog/conventional:

- Channel/frequency may be the primary identity, with optional talkgroup-like channel alias if the backend maps it that way.
- Unit ID may be absent, DTMF/tone-derived, MDC/ANI-derived, or low confidence.
- Replace affiliation language with `last heard on`, `signaling`, or `detected ID` where appropriate.
- Signal quality/frequency/tone/squelch metadata belongs in call/detail context, not as required list columns.

Labeling rule: if the backend cannot confirm a P25-style relationship, show the broader term (`Channel`, `Signal`, `Detected unit ID`, `Last heard`) rather than an empty or misleading P25-specific label.

## Realtime and Monitoring Behavior

Live events should enrich the directory without causing disorienting reordering unless the selected sort is live/recent.

- Active rows get a live indicator immediately.
- Last-heard values may update in place.
- Counts may update optimistically when call_end arrives.
- Monitor toggles subscribe/unsubscribe through the shared live-audio service once available.
- The global player should expose the monitored talkgroup name, unit IDs/aliases, and whether playback is live or queued history.

Monitor selection:

- Talkgroups are keyed by `system_id:tgid`.
- If a user selects a bare TGID from search or import, force system disambiguation before monitoring.
- Bulk monitor is available from selected rows and import review, with a confirmation summary.

## Implementation Notes

- Extract shared `DirectoryToolbar`, `DirectoryRow`, `EntityStateBadge`, `MetadataConfidence`, and `EntityActionCluster` primitives once the pattern library issue is ready.
- Keep domain-specific data mapping in talkgroup/unit feature modules; shared UI primitives should receive already-normalized display props.
- Preserve composite keys in routes and stores: `system_id:tgid` and `system_id:unit_id`.
- Use generated API types as the source of truth for nullable fields and protocol-specific metadata.
- Document any local-only preferences separately from server metadata so users understand what survives across browsers.

## Acceptance Checklist

- Talkgroup and unit list/detail pages share toolbar, density, row, pagination, empty-state, and detail-section patterns.
- Favorite, monitor, color, tag, edit, and import controls are visible in expected places and reflect user permissions.
- Talkgroup detail links to analytics, filtered calls, affiliated/recent units, and transcription search.
- Unit detail links to activity timeline, filtered calls, related talkgroups, and investigation workflows.
- Analog and P25 metadata differences are represented with accurate labels and no misleading empty fields.
- Duplicate IDs across systems are always disambiguated before navigation, monitoring, import, or bulk edits.
