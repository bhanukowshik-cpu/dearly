const GA_ID = import.meta.env.VITE_GA_ID

function gtag(...args) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag(...args)
}

export function trackScreen(screenName) {
  if (!GA_ID) return
  gtag('event', 'page_view', {
    page_title:    screenName,
    page_location: window.location.href,
  })
}

export function trackEvent(eventName, params = {}) {
  if (!GA_ID) return
  gtag('event', eventName, params)
}
