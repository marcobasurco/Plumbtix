import { describe, expect, it } from 'vitest';
import { detectEmergencyKeywords } from '@shared/types/transitions';

// A false emergency texts the customer's staff and phones the on-call person.
// These cases are the ones that used to be upgraded by loose substring matching.
describe('detectEmergencyKeywords', () => {
  it.each([
    'Dripping faucet in break room',
    'Replace gasket on toilet',
    'Sink drain slow, please check, no leak',
    'Need quote for backup water heater',
    'Garbage disposal jammed',
    'Sewer camera inspection requested',
  ])('does not upgrade an ordinary problem: %s', (text) => {
    expect(detectEmergencyKeywords(text)).toBe(false);
  });

  it.each([
    'Restroom is flooding',
    'Pipe burst in the ceiling',
    'Raw sewage on the floor',
    'Strong gas smell near the boiler',
    'I smell gas in the kitchen',
    'Toilet overflowing onto the carpet',
    'Water damage spreading on the wall',
    'FLOODED mechanical room.',
  ])('upgrades wording that cannot wait: %s', (text) => {
    expect(detectEmergencyKeywords(text)).toBe(true);
  });
});
