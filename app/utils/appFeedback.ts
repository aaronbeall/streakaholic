export const SUPPORT_EMAIL = 'support@metamodernmonkey.com';

export interface FeedbackEmailDetails {
  appName: string;
  version?: string | null;
  buildVersion?: string | null;
  platform: string;
  platformVersion?: string | number | null;
  environment?: string | null;
}

/**
 * Prefills only basic app/build information that is useful for troubleshooting. Habit data and
 * device identifiers deliberately stay out of the message; the user can see and edit everything
 * before their email app sends it.
 */
export const buildFeedbackEmailUrl = ({
  appName,
  version,
  buildVersion,
  platform,
  platformVersion,
  environment,
}: FeedbackEmailDetails): string => {
  const versionDescription = [
    version || 'unknown',
    buildVersion ? `(build ${buildVersion})` : null,
  ].filter(Boolean).join(' ');
  const platformDescription = [platform, platformVersion].filter(value => value !== null && value !== undefined && value !== '').join(' ');
  const diagnostics = [
    '---',
    `App: ${appName}`,
    `Version: ${versionDescription}`,
    `Platform: ${platformDescription}`,
    environment ? `Environment: ${environment}` : null,
  ].filter(Boolean).join('\n');
  const body = `Hi,\n\n[Write your feedback here]\n\n\n${diagnostics}`;

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${appName} feedback`)}&body=${encodeURIComponent(body)}`;
};
