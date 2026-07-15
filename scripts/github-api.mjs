const apiUrl = 'https://api.github.com'

function requestHeaders(accept, token) {
  const headers = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mojian-star-history-action',
  }

  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function assertOk(response) {
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  }
  return response
}

export async function githubRequest(
  path,
  { accept = 'application/vnd.github+json', token, publicRepository = false, fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(`${apiUrl}${path}`, {
    headers: requestHeaders(accept, token),
  })

  const isStargazersRequest = /^\/repos\/[^/]+\/[^/]+\/stargazers(?:\?|$)/.test(path)
  if (response.status === 403 && publicRepository && isStargazersRequest) {
    const anonymousResponse = await fetchImpl(`${apiUrl}${path}`, {
      headers: requestHeaders(accept),
    })
    return assertOk(anonymousResponse)
  }

  return assertOk(response)
}
