const apiUrl = 'https://api.github.com'
const graphqlUrl = `${apiUrl}/graphql`
const starHistoryQuery = `
  query StarHistory($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      stargazers(first: 100, after: $cursor) {
        edges {
          starredAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

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

export async function fetchStarDates(repository, { token, fetchImpl = fetch } = {}) {
  const [owner, name, ...extraParts] = repository.split('/')
  if (!owner || !name || extraParts.length > 0) {
    throw new Error(`Invalid GitHub repository: ${repository}`)
  }
  if (!token) throw new Error('GitHub token is required')

  const dates = []
  let cursor = null

  for (;;) {
    const response = await assertOk(
      await fetchImpl(graphqlUrl, {
        method: 'POST',
        headers: {
          ...requestHeaders('application/vnd.github+json', token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: starHistoryQuery,
          variables: { owner, name, cursor },
        }),
      }),
    )
    const payload = await response.json()
    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL: ${payload.errors.map((error) => error.message).join('; ')}`)
    }

    const stargazers = payload.data?.repository?.stargazers
    if (!stargazers) throw new Error(`GitHub GraphQL did not return stargazers for ${repository}`)

    dates.push(...stargazers.edges.map((edge) => edge.starredAt))
    if (!stargazers.pageInfo.hasNextPage) break
    if (!stargazers.pageInfo.endCursor) throw new Error('GitHub GraphQL pagination cursor is missing')
    cursor = stargazers.pageInfo.endCursor
  }

  return dates
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
