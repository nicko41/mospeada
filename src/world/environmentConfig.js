export function resolveEnvironment(search = '') {
  const query = new URLSearchParams(search)
  if (query.get('environment') === 'highway') return 'highway'
  if (query.get('environment') === 'forest') return 'forest'
  // Keep existing bookmarked driving tests working.
  return query.has('start') && query.get('start') !== 'forest' ? 'highway' : 'forest'
}

export const activeEnvironment = resolveEnvironment(typeof location === 'undefined' ? '' : location.search)
export const defaultStart = activeEnvironment === 'forest' ? 'forest' : 'highway'

export function selectEnvironment(start) {
  const url = new URL(window.location.href)
  url.searchParams.set('environment', start === 'forest' ? 'forest' : 'highway')
  url.searchParams.set('start', start)
  window.location.assign(url.href)
}
