// Every link to the BridgeU app goes through appUrl() so tracking and context params stay consistent.

export const APP_ORIGIN = 'https://app.bridgeu.ca';

export type AppContext = {
  /** City display name as the app expects it, e.g. "Kingston". */
  city?: string;
};

export function appUrl(placement: string, context: AppContext = {}): string {
  const url = new URL(APP_ORIGIN);
  url.searchParams.set('utm_source', 'bridgeu.ca');
  url.searchParams.set('utm_medium', 'website');
  url.searchParams.set('utm_campaign', placement);
  if (context.city) url.searchParams.set('city', context.city);
  return url.toString();
}
