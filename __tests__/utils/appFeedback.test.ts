import { buildFeedbackEmailUrl, SUPPORT_EMAIL } from '../../app/utils/appFeedback';

describe('buildFeedbackEmailUrl', () => {
  it('prefills a feedback message with non-sensitive troubleshooting details', () => {
    const url = buildFeedbackEmailUrl({
      appName: 'Streakaholic',
      version: '1.2.3',
      buildVersion: '42',
      platform: 'android',
      platformVersion: 35,
      environment: 'bare',
    });
    const query = url.slice(url.indexOf('?') + 1);
    const params = new URLSearchParams(query);

    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(params.get('subject')).toBe('Streakaholic feedback');
    expect(params.get('body')).toBe(
      'Hi,\n\n[Write your feedback here]\n\n\n---\n'
      + 'App: Streakaholic\n'
      + 'Version: 1.2.3 (build 42)\n'
      + 'Platform: android 35\n'
      + 'Environment: bare'
    );
  });

  it('handles unavailable optional build information without empty labels', () => {
    const url = buildFeedbackEmailUrl({
      appName: 'Streakaholic',
      platform: 'ios',
    });
    const body = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('body');

    expect(body).toContain('Version: unknown');
    expect(body).toContain('Platform: ios');
    expect(body).not.toContain('build');
    expect(body).not.toContain('Environment:');
  });
});
