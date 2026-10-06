// The counts on the menu (unread notifications, approvals waiting for my decision) reload on
// every page change and once a minute (App.tsx). A page that changes one of them calls
// refreshNavBadges() so the count updates straight away.
export const NAV_BADGES_EVENT = 'nav-badges-refresh'

export const refreshNavBadges = () => window.dispatchEvent(new Event(NAV_BADGES_EVENT))
