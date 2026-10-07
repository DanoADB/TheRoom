import { describe, expect, it } from 'vitest';
import { ListenerFailure, safeFailure, stderrCategory, retryableRoomFailure } from './isla-listener-diagnostics';
describe('safe listener diagnostics', () => {
  it('retries transient Room failures but not authentication, configuration or inference', () => {
    for (const diagnostic of [{kind:'unexpected',code:'ENOTFOUND'}, {kind:'timeout'}, {kind:'http',status:503}, {kind:'http',status:429}]) {
      expect(retryableRoomFailure({stage:'room:GET:/messages', ...diagnostic})).toBe(true);
    }
    for (const status of [400,401,403,404]) expect(retryableRoomFailure({stage:'room:GET:/messages',kind:'http',status})).toBe(false);
    expect(retryableRoomFailure({stage:'codex',kind:'timeout'})).toBe(false);
    expect(retryableRoomFailure({stage:'room:GET:/messages',kind:'unexpected',code:'EACCES'})).toBe(false);
  });
  it('never persists arbitrary error text or codes', () => {
    expect(JSON.stringify(safeFailure(Object.assign(new Error('private token'), {code:'private token'}), 'poll'))).not.toContain('private token');
  });
  it('preserves structured failure through shutdown', () => {
    const diagnostic = {stage:'codex',kind:'exit',exitCode:2};
    expect(safeFailure(new ListenerFailure(diagnostic), 'shutdown')).toEqual(diagnostic);
  });
  it('classifies timeout and allowlisted network causes', () => {
    expect(safeFailure({name:'TimeoutError'}, 'request').kind).toBe('timeout');
    expect(safeFailure({cause:{code:'ECONNRESET'}}, 'request').code).toBe('ECONNRESET');
  });
  it('reduces stderr to fixed labels without copying it', () => {
    expect(stderrCategory('private text: quota exceeded')).toBe('usage-limit');
    expect(stderrCategory('private content')).toBeUndefined();
  });
});
