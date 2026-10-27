# Segment Editor

A web app for editing Jellyfin media segments (intro, outro, and similar ranges) on episodes, movies, and music tracks. The player page is where a single item's segments are edited.

## Language

### Episode navigation

**Episode Switcher**:
The header control on the player page that shows the current episode's title and lets the user pick any episode of the series.
_Avoid_: Episode dropdown, episode picker

**Series Order**:
The sequence of a series' playable episodes: regular seasons ascending by season number, then Specials, with episodes ascending within each season. It matches the order of the season tabs on the series page.
_Avoid_: Playback order, air order

**Adjacent Episode**:
The episode immediately before or after the current one in Series Order, crossing season boundaries. The first episode has no previous and the last Special (or last regular episode, if there are none) has no next.
_Avoid_: Sibling episode, neighbour

**Specials**:
The season a series uses for out-of-sequence episodes. A season is Specials when Jellyfin numbers it 0 or its name contains "special", since some metadata providers number Specials differently.
_Avoid_: Extras, season zero, special season

### Segment editing

**Draft**:
The editor's unsaved copy of one item's segments. Edits change only the Draft; a Save writes it, Discard drops it, and switching items drops it too.
_Avoid_: Local edits, editing segments

**Save**:
Replacing the item's whole segment set on the server with the Draft. A Save that fails, conflicts with a change made elsewhere, or completes only partly keeps the Draft so it can be saved again.
_Avoid_: Batch save, sync
