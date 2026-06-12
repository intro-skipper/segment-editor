// Mock Jellyfin server for segment-editor.
// Zero-dependency Node HTTP server, defaulting to :8096.
import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.join(__dirname, 'images')
const VIDEO_PATH = path.join(__dirname, 'video.mp4')
fs.mkdirSync(IMG_DIR, { recursive: true })

const TICKS = 10_000_000
const RUNTIME_SECONDS = 300
const SERVER_ID = 'aaaabbbbccccddddeeeeffff00001111'
const MOCK_SERVER_PORT = Number(process.env.MOCK_SERVER_PORT ?? '8096')
const MOCK_SERVER_ADDRESS =
  process.env.MOCK_SERVER_ADDRESS ?? `http://localhost:${MOCK_SERVER_PORT}`
const MOCK_SERVER_VERSION = process.env.MOCK_SERVER_VERSION ?? '10.10.7'
const MOCK_ACCESS_TOKEN = process.env.MOCK_SERVER_ACCESS_TOKEN ?? 'mock-access-token'
const MOCK_USER_ID =
  process.env.MOCK_SERVER_USER_ID ?? 'fffffffffffffffffffffffffffffff0'
const MOCK_USERNAME = process.env.MOCK_SERVER_USERNAME ?? 'demo'
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? 'ffmpeg'

if (
  !Number.isInteger(MOCK_SERVER_PORT) ||
  MOCK_SERVER_PORT < 1 ||
  MOCK_SERVER_PORT > 65535
) {
  throw new Error(`Invalid MOCK_SERVER_PORT: ${process.env.MOCK_SERVER_PORT}`)
}

// ── deterministic ids ────────────────────────────────────────────────
let idCounter = 0
function nextId(label) {
  idCounter += 1
  const hex = (idCounter).toString(16).padStart(12, '0')
  return `00000000000000000000${hex}`.slice(-32)
}

// ── palette for generated art ────────────────────────────────────────
const PALETTES = [
  ['#1b3a5b', '#73c2fb', 'Slate Harbor'],
  ['#5b1b2e', '#fb7393', 'Crimson Tide'],
  ['#1b5b38', '#73fbb0', 'Verdant'],
  ['#5b4a1b', '#fbd273', 'Amber Fields'],
  ['#2e1b5b', '#a073fb', 'Violet Hour'],
  ['#1b515b', '#73ecfb', 'Teal Drift'],
  ['#5b321b', '#fba273', 'Burnt Sienna'],
  ['#3a5b1b', '#c2fb73', 'Mosswood'],
  ['#5b1b52', '#fb73e8', 'Magenta Falls'],
  ['#33361b', '#e8fb73', 'Olive Grove'],
  ['#1b2a5b', '#7397fb', 'Indigo Deep'],
  ['#5b1b1b', '#fb7373', 'Scarlet Peak'],
]

// ── catalogue ────────────────────────────────────────────────────────
const libraries = [
  { Name: 'TV Shows', ItemId: nextId(), CollectionType: 'tvshows', Locations: ['/media/tv'] },
  { Name: 'Movies', ItemId: nextId(), CollectionType: 'movies', Locations: ['/media/movies'] },
]
const [TV_LIB, MOVIE_LIB] = libraries

const SERIES_DEFS = [
  ['Northern Lights', 2021, 3],
  ['The Long Commute', 2019, 2],
  ['Paper Lanterns', 2023, 1],
  ['Static & Noise', 2018, 4],
  ['Harbor Watch', 2022, 2],
  ['Midnight Diner Club', 2020, 3],
  ['The Cartographers', 2024, 1],
  ['Second Orbit', 2017, 5],
]

const MOVIE_DEFS = [
  ['The Glass Estuary', 2020], ['Afterimage', 2023], ['Driftwood', 2018],
  ['Coldwater Lane', 2021], ['The Last Projectionist', 2019], ['Meridian Zero', 2024],
  ['Sleepwalker City', 2022], ['A Quiet Avalanche', 2016], ['The Orchard Thief', 2023],
  ['Solar Winds', 2025], ['Night Ferry', 2017], ['Lemon Tree Boulevard', 2021],
  ['Borrowed Light', 2019], ['The Winter Cartograph', 2022], ['Static Bloom', 2024],
  ['Hollow Tide', 2018], ['Pale Meridian', 2023], ['The Glass Aviary', 2020],
  ['Copper Season', 2017], ['Lantern Faces', 2025], ['The Echo Garden', 2021],
  ['Smoke Over Brigantine', 2016], ['Velvet Antenna', 2022], ['Half-Life Holiday', 2024],
  ['The Paper Sea', 2019], ['Ultramarine', 2023], ['Dust & Daylight', 2018],
  ['The Quiet Engine', 2021], ['Stray Satellites', 2025], ['Honeycomb Palace', 2020],
]

const EPISODE_TITLES = [
  'Pilot', 'The Arrival', 'Crossed Wires', 'Low Tide', 'Signal Fire',
  'The Long Way Home', 'Glass Houses', 'Undertow', 'Cold Open', 'Terminus',
]

function makeMediaSource(id) {
  return {
    Id: id.replace(/-/g, ''),
    Container: 'mp4',
    Bitrate: 1200000,
    Path: '/media/file.mp4',
    Protocol: 'File',
    MediaStreams: [
      {
        Type: 'Video', Codec: 'h264', Index: 0, Width: 1280, Height: 720,
        Profile: 'High', Level: 40, BitRate: 1000000, IsDefault: true,
        AverageFrameRate: 25, RealFrameRate: 25, DisplayTitle: '720p H264',
        VideoRange: 'SDR', VideoRangeType: 'SDR',
      },
      {
        Type: 'Audio', Codec: 'aac', Index: 1, Language: 'eng', ChannelLayout: 'stereo',
        Channels: 2, SampleRate: 48000, IsDefault: true, DisplayTitle: 'English - AAC - Stereo',
      },
    ],
  }
}

const items = new Map() // id -> BaseItemDto
const childrenOf = new Map() // parentId -> [ids]
const segmentsByItem = new Map() // itemId -> [MediaSegmentDto] (server ticks)
const artOf = new Map() // id -> {bg, fg, label, kind}

function addItem(item, parentId, art) {
  items.set(item.Id, item)
  if (parentId) {
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
    childrenOf.get(parentId).push(item.Id)
  }
  if (art) artOf.set(item.Id, art)
  return item
}

// libraries as items (for /Items/{id}/Images)
libraries.forEach((lib, i) => {
  artOf.set(lib.ItemId, { bg: PALETTES[i + 4][0], fg: PALETTES[i + 4][1], label: lib.Name, kind: 'wide' })
})

let seriesIdx = 0
for (const [name, year, seasonCount] of SERIES_DEFS) {
  const pal = PALETTES[seriesIdx % PALETTES.length]
  const seriesId = nextId()
  addItem({
    Id: seriesId, Name: name, Type: 'Series', IsFolder: true, ProductionYear: year,
    ImageTags: { Primary: 'p1' }, ServerId: SERVER_ID,
  }, TV_LIB.ItemId, { bg: pal[0], fg: pal[1], label: name, kind: 'poster' })

  for (let s = 1; s <= seasonCount; s++) {
    const seasonId = nextId()
    addItem({
      Id: seasonId, Name: `Season ${s}`, Type: 'Season', IsFolder: true, IndexNumber: s,
      SeriesId: seriesId, SeriesName: name, ImageTags: { Primary: 'p1' }, ServerId: SERVER_ID,
    }, seriesId, { bg: pal[0], fg: pal[1], label: `${name}\nSeason ${s}`, kind: 'poster' })

    const episodeCount = 8
    for (let e = 1; e <= episodeCount; e++) {
      const epId = nextId()
      const title = EPISODE_TITLES[(e - 1) % EPISODE_TITLES.length]
      addItem({
        Id: epId, Name: title, Type: 'Episode', IndexNumber: e, ParentIndexNumber: s,
        SeriesId: seriesId, SeasonId: seasonId, SeriesName: name,
        RunTimeTicks: RUNTIME_SECONDS * TICKS, ImageTags: { Primary: 'p1' },
        MediaSources: [makeMediaSource(epId)], ServerId: SERVER_ID,
        SeriesPrimaryImageTag: 'p1',
      }, seasonId, { bg: pal[0], fg: pal[1], label: `${name}\nS${s}E${e} ${title}`, kind: 'wide' })

      // seed segments on most episodes; leave some empty to test empty state
      if (e % 4 !== 3) {
        segmentsByItem.set(epId, [
          { Id: nextId(), ItemId: epId, Type: 'Intro', StartTicks: 12 * TICKS, EndTicks: 48 * TICKS },
          ...(e % 2 === 0 ? [{ Id: nextId(), ItemId: epId, Type: 'Recap', StartTicks: 2 * TICKS, EndTicks: 11 * TICKS }] : []),
          { Id: nextId(), ItemId: epId, Type: 'Outro', StartTicks: 270 * TICKS, EndTicks: 296 * TICKS },
          ...(e % 3 === 0 ? [{ Id: nextId(), ItemId: epId, Type: 'Preview', StartTicks: 296 * TICKS, EndTicks: 300 * TICKS }] : []),
        ])
      }
    }
  }
  seriesIdx += 1
}

let movieIdx = 0
for (const [name, year] of MOVIE_DEFS) {
  const pal = PALETTES[(movieIdx + 5) % PALETTES.length]
  const movieId = nextId()
  addItem({
    Id: movieId, Name: name, Type: 'Movie', ProductionYear: year,
    RunTimeTicks: RUNTIME_SECONDS * TICKS, ImageTags: { Primary: 'p1' },
    MediaSources: [makeMediaSource(movieId)], ServerId: SERVER_ID,
  }, MOVIE_LIB.ItemId, { bg: pal[0], fg: pal[1], label: name, kind: 'poster' })
  if (movieIdx % 2 === 0) {
    segmentsByItem.set(movieId, [
      { Id: nextId(), ItemId: movieId, Type: 'Commercial', StartTicks: 100 * TICKS, EndTicks: 130 * TICKS },
      { Id: nextId(), ItemId: movieId, Type: 'Outro', StartTicks: 280 * TICKS, EndTicks: 300 * TICKS },
    ])
  }
  movieIdx += 1
}

// ── image generation (ffmpeg, cached) ────────────────────────────────
const FONT = path.join(__dirname, 'dejavu-sans-bold.ttf').replace(/\\/g, '/').replace(/:/g, '\\:')
const inflight = new Map()

function genImage(id) {
  const art = artOf.get(id) ?? { bg: '#333344', fg: '#aab', label: 'Unknown', kind: 'poster' }
  const file = path.join(IMG_DIR, `${id}-${art.kind}.png`)
  if (fs.existsSync(file)) return Promise.resolve(file)
  if (inflight.has(file)) return inflight.get(file)

  const [w, h] = art.kind === 'poster' ? [420, 630] : [480, 270]
  const size = `${w}x${h}`
  const fontsize = art.kind === 'poster' ? 34 : 24
  const lines = art.label.split('\n')
  const drawtexts = lines.map((line, i) => {
    const esc = line.replace(/[\\:'%]/g, '')
    const y = art.kind === 'poster' ? `(h*0.72)+${i * (fontsize + 10)}` : `(h*0.62)+${i * (fontsize + 8)}`
    return `drawtext=fontfile=${FONT}:text='${esc}':fontcolor=${art.fg}:fontsize=${fontsize}:x=24:y=${y}`
  }).join(',')
  const gradient = `gradients=s=${size}:c0=${art.bg}:c1=${shade(art.bg, -28)}:x0=0:y0=0:x1=${w}:y1=${h}:d=1`
  const filter = `${gradient},${drawtexts},drawbox=x=0:y=0:w=iw:h=12:color=${art.fg}@0.9:t=fill`

  const p = new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG_PATH, ['-v', 'error', '-f', 'lavfi', '-i', filter, '-frames:v', '1', '-y', file])
    ff.on('error', (error) => reject(new Error(`${FFMPEG_PATH}: ${error.message}`)))
    ff.on('exit', (code) => (code === 0 ? resolve(file) : reject(new Error(`${FFMPEG_PATH} ${code}`))))
  }).finally(() => inflight.delete(file))
  inflight.set(file, p)
  return p
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, (n >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// ── helpers ──────────────────────────────────────────────────────────
function json(res, body, status = 200) {
  const buf = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': buf.length,
  })
  res.end(buf)
}

function notFound(res) {
  json(res, { error: 'not found' }, 404)
}

function collectDescendants(rootId, predicate) {
  const out = []
  const stack = [...(childrenOf.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop()
    const item = items.get(id)
    if (!item) continue
    if (predicate(item)) out.push(item)
    const kids = childrenOf.get(id)
    if (kids) stack.push(...kids)
  }
  return out
}

function sortByName(arr) {
  return arr.toSorted((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
}

function serveVideo(req, res) {
  if (!fs.existsSync(VIDEO_PATH)) return notFound(res)
  const stat = fs.statSync(VIDEO_PATH)
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? parseInt(m[1], 10) : 0
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
    end = Math.min(end, stat.size - 1)
    res.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    })
    fs.createReadStream(VIDEO_PATH, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    })
    fs.createReadStream(VIDEO_PATH).pipe(res)
  }
}

// ── request handling ─────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, MOCK_SERVER_ADDRESS)
  const p = url.pathname.replace(/\/+$/, '') || '/'
  const origin = req.headers.origin ?? '*'

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Timing-Allow-Origin', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // log
  console.log(`${req.method} ${p}${url.search}`)

  // System info
  if (p === '/System/Info/Public') {
    return json(res, {
      Id: SERVER_ID, LocalAddress: MOCK_SERVER_ADDRESS, ProductName: 'Jellyfin Server',
      ServerName: 'Mockfin', Version: MOCK_SERVER_VERSION, StartupWizardCompleted: true,
    })
  }
  if (p === '/System/Info') {
    return json(res, {
      Id: SERVER_ID, ServerName: 'Mockfin', Version: MOCK_SERVER_VERSION, OperatingSystem: 'Linux',
      LocalAddress: MOCK_SERVER_ADDRESS,
    })
  }

  // Auth (username/password)
  if (p === '/Users/AuthenticateByName') {
    return json(res, {
      User: { Id: MOCK_USER_ID, Name: MOCK_USERNAME, ServerId: SERVER_ID },
      AccessToken: MOCK_ACCESS_TOKEN,
      ServerId: SERVER_ID,
    })
  }

  // Libraries
  if (p === '/Library/VirtualFolders') {
    return json(res, libraries)
  }

  // Plugins list (segment provider detection)
  if (p === '/Plugins') {
    return json(res, [
      { Id: 'c83d86bb-a1e0-4c35-a113-e2101cf4ee6b', Name: 'Intro Skipper', Version: '1.0.0', Status: 'Active' },
    ])
  }

  // Items query
  if (p === '/Items' && req.method === 'GET') {
    const ids = url.searchParams.get('ids')
    if (ids) {
      const found = ids.split(',').map((id) => items.get(id)).filter(Boolean)
      return json(res, { Items: found, TotalRecordCount: found.length, StartIndex: 0 })
    }
    const parentId = url.searchParams.get('parentId')
    const searchTerm = (url.searchParams.get('searchTerm') ?? '').toLowerCase()
    const recursive = url.searchParams.get('recursive') === 'true'
    const startIndex = parseInt(url.searchParams.get('startIndex') ?? '0', 10)
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)

    let list = []
    if (parentId) {
      if (recursive || searchTerm) {
        list = collectDescendants(parentId, (it) => ['Series', 'Movie', 'Episode'].includes(it.Type))
        if (searchTerm) list = list.filter((it) => (it.Name ?? '').toLowerCase().includes(searchTerm))
        // de-prioritize episodes in search results
        list = sortByName(list.filter((x) => x.Type !== 'Episode')).concat(sortByName(list.filter((x) => x.Type === 'Episode')))
      } else {
        list = (childrenOf.get(parentId) ?? []).map((id) => items.get(id))
        list = sortByName(list)
      }
    }
    const page = list.slice(startIndex, startIndex + limit)
    return json(res, { Items: page, TotalRecordCount: list.length, StartIndex: startIndex })
  }

  // Single item
  let m = /^\/Items\/([0-9a-f-]+)$/i.exec(p)
  if (m && req.method === 'GET') {
    const item = items.get(m[1].replace(/-/g, ''))
    return item ? json(res, item) : notFound(res)
  }

  // Images
  m = /^\/Items\/([0-9a-f-]+)\/Images\/(\w+)/i.exec(p)
  if (m) {
    const id = m[1].replace(/-/g, '')
    try {
      const file = await genImage(id)
      const buf = fs.readFileSync(file)
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' })
      return res.end(buf)
    } catch (e) {
      console.error('image gen failed', e.message)
      return notFound(res)
    }
  }

  // Seasons / Episodes
  m = /^\/Shows\/([0-9a-f-]+)\/Seasons$/i.exec(p)
  if (m) {
    const seriesId = m[1].replace(/-/g, '')
    const seasons = (childrenOf.get(seriesId) ?? []).map((id) => items.get(id)).filter((x) => x.Type === 'Season')
    return json(res, { Items: seasons, TotalRecordCount: seasons.length })
  }
  m = /^\/Shows\/([0-9a-f-]+)\/Episodes$/i.exec(p)
  if (m) {
    const seasonId = url.searchParams.get('seasonId')
    const eps = (childrenOf.get(seasonId ?? '') ?? []).map((id) => items.get(id)).filter((x) => x.Type === 'Episode')
    return json(res, { Items: eps, TotalRecordCount: eps.length })
  }

  // Media segments (read)
  m = /^\/MediaSegments\/([0-9a-f-]+)$/i.exec(p)
  if (m && req.method === 'GET') {
    const segs = segmentsByItem.get(m[1].replace(/-/g, '')) ?? []
    return json(res, { Items: segs, TotalRecordCount: segs.length })
  }

  // Segment provider write API (intro-skipper style)
  m = /^\/MediaSegmentsApi\/([0-9a-f-]+)$/i.exec(p)
  if (m && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const seg = JSON.parse(body)
        const itemId = (seg.ItemId ?? m[1]).replace(/-/g, '')
        const stored = { ...seg, Id: (seg.Id ?? nextId()).replace(/-/g, ''), ItemId: itemId }
        if (!segmentsByItem.has(itemId)) segmentsByItem.set(itemId, [])
        segmentsByItem.get(itemId).push(stored)
        json(res, stored)
      } catch {
        json(res, { error: 'bad json' }, 400)
      }
    })
    return
  }
  if (m && req.method === 'DELETE') {
    const segId = m[1].replace(/-/g, '')
    for (const [itemId, segs] of segmentsByItem) {
      const idx = segs.findIndex((s) => (s.Id ?? '').replace(/-/g, '') === segId)
      if (idx !== -1) {
        segs.splice(idx, 1)
        break
      }
    }
    res.writeHead(204)
    return res.end()
  }

  // Video stream (direct play)
  m = /^\/Videos\/([0-9a-f-]+)\/stream/i.exec(p)
  if (m) return serveVideo(req, res)

  // HLS fallback: serve same file as single-segment playlist? Direct play should be used.
  if (/master\.m3u8$/.test(p)) {
    res.writeHead(404)
    return res.end()
  }

  // Playstate / sessions reporting
  if (p.startsWith('/Sessions') || p.startsWith('/PlayingItems') || p.startsWith('/UserPlayedItems')) {
    res.writeHead(204)
    return res.end()
  }

  // Search hints
  if (p === '/Search/Hints') {
    const q = (url.searchParams.get('searchTerm') ?? '').toLowerCase()
    const hits = [...items.values()].filter((it) => ['Series', 'Movie'].includes(it.Type) && (it.Name ?? '').toLowerCase().includes(q)).slice(0, 20)
    return json(res, {
      SearchHints: hits.map((it) => ({ Id: it.Id, ItemId: it.Id, Name: it.Name, Type: it.Type, ProductionYear: it.ProductionYear })),
      TotalRecordCount: hits.length,
    })
  }

  console.log('  -> unhandled')
  notFound(res)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`mockfin failed: port ${MOCK_SERVER_PORT} is already in use`)
  } else {
    console.error(`mockfin failed: ${error.message}`)
  }
  process.exit(1)
})

server.listen(MOCK_SERVER_PORT, () =>
  console.log(`mockfin listening on ${MOCK_SERVER_ADDRESS}`),
)
