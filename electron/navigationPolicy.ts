const developmentProtocols = new Set(['http:', 'https:'])

function isWithinPathScope(targetPath: string, applicationPath: string): boolean {
  if (targetPath === applicationPath) return true

  const scope = applicationPath.endsWith('/')
    ? applicationPath
    : `${applicationPath}/`
  return targetPath.startsWith(scope)
}

export function isAllowedApplicationNavigation(
  targetUrl: string,
  applicationUrl: string,
): boolean {
  try {
    const target = new URL(targetUrl)
    const application = new URL(applicationUrl)

    if (application.protocol === 'file:') {
      return target.protocol === application.protocol
        && target.host === application.host
        && target.port === application.port
        && target.pathname === application.pathname
    }

    if (!developmentProtocols.has(application.protocol)) return false

    return target.protocol === application.protocol
      && target.origin === application.origin
      && target.username === application.username
      && target.password === application.password
      && isWithinPathScope(target.pathname, application.pathname)
  } catch {
    return false
  }
}
