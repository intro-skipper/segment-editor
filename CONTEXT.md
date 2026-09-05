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
