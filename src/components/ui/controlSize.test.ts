import { describe, it, expect } from 'vitest';
import { resolveControlSize } from './controlSize';

describe('resolveControlSize', () => {
  it('mantém a forma canônica', () => {
    expect(resolveControlSize('sm')).toBe('sm');
    expect(resolveControlSize('md')).toBe('md');
    expect(resolveControlSize('lg')).toBe('lg');
  });

  // Os apelidos por extenso já eram aceitos pelo Button antes da escala
  // existir; quebrá-los quebraria chamadas espalhadas pela aplicação.
  it('traduz os apelidos por extenso', () => {
    expect(resolveControlSize('small')).toBe('sm');
    expect(resolveControlSize('medium')).toBe('md');
    expect(resolveControlSize('large')).toBe('lg');
  });

  it('cai em md sem argumento', () => {
    expect(resolveControlSize()).toBe('md');
  });

  it('cai em md diante de valor fora da escala', () => {
    expect(resolveControlSize('gigante' as never)).toBe('md');
    expect(resolveControlSize(undefined)).toBe('md');
  });
});
