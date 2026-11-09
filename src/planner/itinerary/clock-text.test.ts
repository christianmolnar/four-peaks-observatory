import { clockFromText, couldBecomeClock } from './clock-text';

describe('clockFromText', () => {
  it.each([
    ['21:30', '21:30'],
    ['2130', '21:30'],
    ['9:05', '09:05'],
    ['905', '09:05'],
    ['0905', '09:05'],
    ['  21:30 ', '21:30'],
    [' 905 ', '09:05'],
    ['２１３０', '21:30'],
    ['２１：３０', '21:30'],
    ['　９０５　', '09:05'],
    ['0:00', '00:00'],
    ['2359', '23:59'],
  ])('%j is %j', (text, clock) => expect(clockFromText(text)).toBe(clock));

  it.each(['', '2', '21', '9:5', '24:00', '2460', '99', '12345', '21.30', 'ab', '21:30pm', '-905'])('%j is not a time', (text) => expect(clockFromText(text)).toBeNull());
});

describe('couldBecomeClock: a half-typed time is not an error yet', () => {
  it.each(['', '2', '21', '213', '2130', '9:', '9:0', '21:3', ' 2 ', '２'])('%j can still become a time', (text) => expect(couldBecomeClock(text)).toBe(true));
  it.each(['a', '21:30:', '12345', '2::', '21-30', '9 05'])('%j cannot', (text) => expect(couldBecomeClock(text)).toBe(false));
});
