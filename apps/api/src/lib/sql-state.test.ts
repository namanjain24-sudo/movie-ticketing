import { describe, expect, it } from 'vitest';
import { LOCK_TIMEOUT_SQLSTATE, RETRYABLE_SQLSTATES, sqlState } from './sql-state';

/**
 * This exists because getting it wrong is silent and expensive. A load run
 * once reported 57 internal errors that were really lock contention, because
 * the SQLSTATE was nested one level deeper than the handler looked, and every
 * one of them reached the client as a 500 instead of a retryable 409.
 */
describe('sqlState', () => {
  it('reads the code Prisma nests inside a driver adapter error', () => {
    const err = {
      code: 'P2010',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { code: '55P03', originalCode: '55P03', kind: 'postgres' },
        },
      },
    };
    expect(sqlState(err)).toBe(LOCK_TIMEOUT_SQLSTATE);
  });

  it('reads a code reported directly on meta', () => {
    expect(sqlState({ code: 'P2010', meta: { code: '40P01' } })).toBe('40P01');
    expect(RETRYABLE_SQLSTATES.has('40P01')).toBe(true);
  });

  it('reads a bare driver error', () => {
    expect(sqlState({ code: '57P01' })).toBe('57P01');
  });

  it('falls back to the message when the code is only written there', () => {
    const err = new Error('Raw query failed. Code: `55P03`. Message: `canceling statement`');
    expect(sqlState(err)).toBe(LOCK_TIMEOUT_SQLSTATE);
  });

  it('never mistakes a Prisma P-code for a SQLSTATE', () => {
    expect(sqlState({ code: 'P2002' })).toBeUndefined();
    expect(sqlState({ code: 'P2028' })).toBeUndefined();
  });

  it('returns nothing for errors that carry no code', () => {
    expect(sqlState(new Error('boom'))).toBeUndefined();
    expect(sqlState(null)).toBeUndefined();
    expect(sqlState('a string')).toBeUndefined();
  });
});
