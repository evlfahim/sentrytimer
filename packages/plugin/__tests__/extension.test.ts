import { detectGitContext } from '@sentry-timer/core';

describe('plugin core integration', () => {
  it('should import detectGitContext from core', () => {
    expect(typeof detectGitContext).toBe('function');
  });

  it('should detect git context in the project', () => {
    const context = detectGitContext();
    expect(context).not.toBeNull();
    if (context) {
      expect(context.repoPath).toBeDefined();
      expect(context.branch).toBeDefined();
    }
  });
});
