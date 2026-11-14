import { useLocation } from 'react-router-dom';

export interface RouteChrome {
  isAgent: boolean;
  hidePentestTelemetry: boolean;
  autoCollapseNav: boolean;
}

/** Single route policy for the app shell. Components consume flags, they do
 * not compare pathnames. */
export function useRouteChrome(): RouteChrome {
  const { pathname } = useLocation();
  const isAgent = pathname.startsWith('/agent');
  return {
    isAgent,
    hidePentestTelemetry: isAgent,
    autoCollapseNav: isAgent,
  };
}
