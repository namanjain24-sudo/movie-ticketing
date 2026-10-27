import { joinWords } from '../format';

describe('joinWords', () => {
  it('says nothing for nothing', () => {
    expect(joinWords([])).toBe('');
  });

  it('leaves one word alone', () => {
    expect(joinWords(['F11'])).toBe('F11');
  });

  it('joins a pair with "and", not a comma', () => {
    expect(joinWords(['F11', 'F12'])).toBe('F11 and F12');
  });

  it('commas the rest and keeps "and" for the last', () => {
    expect(joinWords(['F11', 'F12', 'F13'])).toBe('F11, F12 and F13');
  });
});
