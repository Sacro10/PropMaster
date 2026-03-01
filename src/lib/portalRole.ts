export type PortalRoleIntent = 'owner' | 'tenant' | 'vendor';

const SESSION_ROLE_INTENT_KEY = 'role_intent';
const ACTIVE_PORTAL_ROLE_KEY = 'active_portal_role';

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'manager']);

function normalizeIntent(value: string | null | undefined): PortalRoleIntent | null {
  if (!value) return null;
  if (value === 'owner' || value === 'tenant' || value === 'vendor') {
    return value;
  }
  return null;
}

export function inferPortalRoleFromPath(pathname: string): PortalRoleIntent | null {
  if (pathname.startsWith('/portal/tenant') || pathname.startsWith('/tenant/')) {
    return 'tenant';
  }
  if (pathname.startsWith('/vendor/')) {
    return 'vendor';
  }
  if (pathname.startsWith('/app/')) {
    return 'owner';
  }
  return null;
}

export function getSessionRoleIntent(): PortalRoleIntent | null {
  if (typeof window === 'undefined') return null;
  return normalizeIntent(sessionStorage.getItem(SESSION_ROLE_INTENT_KEY));
}

export function getStoredPortalRoleIntent(): PortalRoleIntent | null {
  if (typeof window === 'undefined') return null;
  return normalizeIntent(localStorage.getItem(ACTIVE_PORTAL_ROLE_KEY));
}

export function resolvePortalRoleIntent(): PortalRoleIntent | null {
  if (typeof window === 'undefined') return null;
  return (
    getSessionRoleIntent() ||
    inferPortalRoleFromPath(window.location.pathname) ||
    getStoredPortalRoleIntent()
  );
}

export function setSessionRoleIntent(intent: PortalRoleIntent) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_ROLE_INTENT_KEY, intent);
}

export function clearSessionRoleIntent() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_ROLE_INTENT_KEY);
}

export function setActivePortalRoleIntent(intent: PortalRoleIntent) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_PORTAL_ROLE_KEY, intent);
}

export function clearActivePortalRoleIntent() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACTIVE_PORTAL_ROLE_KEY);
}

export function roleMatchesPortalIntent(intent: PortalRoleIntent, role: string | null | undefined): boolean {
  if (!role) return false;
  if (intent === 'owner') {
    return MANAGEMENT_ROLES.has(role);
  }
  return role === intent;
}

export function roleToPortalIntent(role: string | null | undefined): PortalRoleIntent | null {
  if (!role) return null;
  if (role === 'tenant' || role === 'vendor') {
    return role;
  }
  if (MANAGEMENT_ROLES.has(role)) {
    return 'owner';
  }
  return null;
}

