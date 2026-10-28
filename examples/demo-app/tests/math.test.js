const { add, divide, isAdult, clamp } = require('../src/math');

describe('add', () => {
  test('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});

describe('divide', () => {
  test('divides numbers', () => {
    divide(10, 2);
  });

  test('throws on zero', () => {
    expect(() => divide(1, 0)).toThrow();
  });
});

describe('isAdult', () => {
  test('returns true for adults', () => {
    expect(isAdult(20)).toBe(true);
  });
});

describe('clamp', () => {
  test('clamps values below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('clamps values above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
