// @vitest-environment node

import { describe, expect, test, vi } from 'vitest'

import { githubRequest } from '../../scripts/github-api.mjs'

describe('githubRequest', () => {
  test('retries a public stargazers request anonymously after an authenticated 403', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'You do not have permission to view the stargazers of this repository',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const response = await githubRequest('/repos/Starsrift/mojian-story-planner/stargazers', {
      accept: 'application/vnd.github.star+json',
      token: 'github-actions-token',
      publicRepository: true,
      fetchImpl,
    })

    expect(await response.json()).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer github-actions-token',
    )
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).has('Authorization')).toBe(false)
  })

  test('does not retry a private stargazers request anonymously', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      githubRequest('/repos/Starsrift/mojian-story-planner/stargazers', {
        token: 'github-actions-token',
        publicRepository: false,
        fetchImpl,
      }),
    ).rejects.toThrow('GitHub API 403')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('does not retry a non-stargazers request anonymously', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      githubRequest('/repos/Starsrift/mojian-story-planner', {
        token: 'github-actions-token',
        publicRepository: true,
        fetchImpl,
      }),
    ).rejects.toThrow('GitHub API 403')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
