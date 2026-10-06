import { describe, expect, it } from 'vitest';
import { ListenerFailure, safeFailure, stderrCategory } from './isla-listener-diagnostics';
describe('safe listener diagnostics', () => {
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
