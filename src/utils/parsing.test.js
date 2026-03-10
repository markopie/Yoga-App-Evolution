import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseHoldTimes, secsToMSS, buildHoldString, parseSequenceText } from './parsing.js';

describe('parsing helpers', () => {
  describe('parseHoldTimes', () => {
    test('handles missing or empty hold strings', () => {
      const expected = { standard: 30, short: 15, long: 60 };
      assert.deepStrictEqual(parseHoldTimes(''), expected);
      assert.deepStrictEqual(parseHoldTimes(null), expected);
      assert.deepStrictEqual(parseHoldTimes(undefined), expected);
    });

    test('parses MM:SS formatted times', () => {
      const input = "Standard: 1:30 | Short: 0:45 | Long: 3:00";
      const expected = { standard: 90, short: 45, long: 180 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });

    test('parses seconds-only formatted times', () => {
      const input = "Standard: 90 | Short: 45 | Long: 180";
      const expected = { standard: 90, short: 45, long: 180 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });

    test('handles mixed-case keys and extra whitespace', () => {
      const input = "  sTandArd:   1:00 | SHORT:  30 |   lOnG:2:00  ";
      const expected = { standard: 60, short: 30, long: 120 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });
    
    test('handles malformed input gracefully by retaining defaults for missing parts', () => {
      const input = "Standard: 1:00 | Gibberish | Long: 120";
      const expected = { standard: 60, short: 15, long: 120 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });
  });

  describe('secsToMSS', () => {
    test('converts seconds to MM:SS string', () => {
      assert.strictEqual(secsToMSS(0), '0:00');
      assert.strictEqual(secsToMSS(45), '0:45');
      assert.strictEqual(secsToMSS(90), '1:30');
      assert.strictEqual(secsToMSS(600), '10:00');
    });

    test('handles invalid inputs by treating them as 0', () => {
      assert.strictEqual(secsToMSS(-10), '0:00');
      assert.strictEqual(secsToMSS('invalid'), '0:00');
      assert.strictEqual(secsToMSS(null), '0:00');
    });
  });

  describe('buildHoldString', () => {
    test('builds standard hold string', () => {
      assert.strictEqual(buildHoldString(90, 45, 180), "Standard: 1:30 | Short: 0:45 | Long: 3:00");
    });
  });

  describe('parseSequenceText', () => {
    test('handles empty or invalid sequence text', () => {
      assert.deepStrictEqual(parseSequenceText(''), []);
      assert.deepStrictEqual(parseSequenceText(null), []);
      assert.deepStrictEqual(parseSequenceText(123), []);
    });

    test('parses normal lines with id, duration, and notes', () => {
      const input = `001 | 60 | [Tadasana] focus on breath
12 | 30 | transition`;
      const result = parseSequenceText(input);
      assert.strictEqual(result.length, 2);
      
      // first line
      assert.deepStrictEqual(result[0][0], ['001']);
      assert.strictEqual(result[0][1], 60);
      assert.strictEqual(result[0][4], '[Tadasana] focus on breath');
      
      // second line
      assert.deepStrictEqual(result[1][0], ['012']); // 12 pads to 012
      assert.strictEqual(result[1][1], 30);
      assert.strictEqual(result[1][4], 'transition');
    });

    test('handles macros/variations in notes', () => {
      const input = "003 | 90 | [Utthita Trikonasana IV] extended hold";
      const result = parseSequenceText(input);
      assert.strictEqual(result[0][3], 'IV');
    });

    test('handles invalid duration values by falling back to 0', () => {
      const input = "001 | invalid | [Note]";
      const result = parseSequenceText(input);
      assert.strictEqual(result[0][1], 0);
    });
  });
});