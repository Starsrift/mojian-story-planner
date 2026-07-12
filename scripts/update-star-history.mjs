import { mkdir, writeFile } from 'node:fs/promises'

const repository = process.env.GITHUB_REPOSITORY || 'Starsrift/mojian-story-planner'
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

if (!token) {
  throw new Error('GH_TOKEN or GITHUB_TOKEN is required')
}

const headers = {
  Accept: 'application/vnd.github.star+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'mojian-star-history-action',
}

async function github(path, accept = headers.Accept) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { ...headers, Accept: accept },
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  }
  return response
}

const metadata = await (await github(`/repos/${repository}`, 'application/vnd.github+json')).json()
const stars = []

for (let page = 1; ; page += 1) {
  const batch = await (await github(`/repos/${repository}/stargazers?per_page=100&page=${page}`)).json()
  stars.push(...batch)
  if (batch.length < 100) break
}

const createdAt = new Date(metadata.created_at)
const today = new Date()
const startTime = createdAt.getTime()
const endTime = Math.max(today.getTime(), startTime + 24 * 60 * 60 * 1000)
const datedStars = stars
  .map((item) => new Date(item.starred_at))
  .filter((date) => !Number.isNaN(date.getTime()))
  .sort((a, b) => a.getTime() - b.getTime())

const points = [{ date: createdAt, value: 0 }]
datedStars.forEach((date, index) => points.push({ date, value: index + 1 }))
points.push({ date: today, value: datedStars.length })

const width = 960
const height = 480
const margin = { top: 112, right: 50, bottom: 72, left: 86 }
const plotWidth = width - margin.left - margin.right
const plotHeight = height - margin.top - margin.bottom
const maxStars = Math.max(5, datedStars.length)
const yMax = Math.ceil(maxStars / 5) * 5
const x = (date) => margin.left + ((date.getTime() - startTime) / (endTime - startTime)) * plotWidth
const y = (value) => margin.top + plotHeight - (value / yMax) * plotHeight
const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char])
const dateLabel = (date) => date.toISOString().slice(0, 10)

const linePath = points
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.date).toFixed(2)} ${y(point.value).toFixed(2)}`)
  .join(' ')

const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((yMax / 5) * index))
const xTicks = Array.from({ length: 6 }, (_, index) => new Date(startTime + ((endTime - startTime) / 5) * index))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(repository)} Star History</title>
  <desc id="desc">${datedStars.length} cumulative GitHub stars as of ${dateLabel(today)}.</desc>
  <rect width="${width}" height="${height}" rx="18" fill="#faf8f3"/>
  <text x="64" y="58" fill="#2b2723" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Star History</text>
  <text x="64" y="84" fill="#8a8378" font-family="system-ui, sans-serif" font-size="13">${escapeXml(repository)}</text>
  <text x="896" y="60" text-anchor="end" fill="#8b5e3c" font-family="system-ui, sans-serif" font-size="28" font-weight="700">${datedStars.length} ★</text>
  ${yTicks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" stroke="#e3dccd"/><text x="${margin.left - 14}" y="${y(tick) + 4}" text-anchor="end" fill="#8a8378" font-family="system-ui, sans-serif" font-size="11">${tick}</text>`).join('\n  ')}
  ${xTicks.map((tick) => `<line x1="${x(tick)}" y1="${margin.top}" x2="${x(tick)}" y2="${height - margin.bottom}" stroke="#eee8dc"/><text x="${x(tick)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#8a8378" font-family="system-ui, sans-serif" font-size="11">${dateLabel(tick)}</text>`).join('\n  ')}
  <path d="${linePath}" fill="none" stroke="#8b5e3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${x(points.at(-1).date)}" cy="${y(points.at(-1).value)}" r="5" fill="#c4683f" stroke="#faf8f3" stroke-width="3"/>
  <text x="${width / 2}" y="${height - 20}" text-anchor="middle" fill="#8a8378" font-family="system-ui, sans-serif" font-size="11">Updated ${dateLabel(today)} by GitHub Actions</text>
</svg>\n`

await mkdir('assets', { recursive: true })
await writeFile('assets/star-history.svg', svg, 'utf8')
console.log(`Updated star chart for ${repository}: ${datedStars.length} stars`)
