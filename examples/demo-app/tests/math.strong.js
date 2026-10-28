const { add, divide, isAdult, clamp } = require('../src/math');

describe('add', () => {
  test('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});

describe('divide', () => {
  test('divides numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  test('throws on zero with appropriate error message', () => {
    expect(() => divide(1, 0)).toThrow('Cannot divide by zero');
  });
});

describe('isAdult', () => {
  test('returns false for 17-year-olds', () => {
    expect(isAdult(17)).toBe(false);
  });

  test('returns true for 18-year-olds', () => {
    expect(isAdult(18)).toBe(true);
  });
});

describe('clamp', () => {
  test('clamps values below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('clamps values above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
