import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseHoldTimes, secsToMSS, buildHoldString, parseSequenceText } from './parsing.js';

describe('parsing helpers', () => {
  describe('parseHoldTimes', () => {
    test('handles missing or empty hold strings', () => {
      const expected = { standard: 30, short: 15, long: 60, flow: 5 };
      assert.deepStrictEqual(parseHoldTimes(''), expected);
      assert.deepStrictEqual(parseHoldTimes(null), expected);
      assert.deepStrictEqual(parseHoldTimes(undefined), expected);
    });

    test('parses MM:SS formatted times', () => {
      const input = "Standard: 1:30 | Short: 0:45 | Long: 3:00";
      const expected = { standard: 90, short: 45, long: 180, flow: 5 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });

    test('parses seconds-only formatted times', () => {
      const input = "Standard: 90 | Short: 45 | Long: 180";
      const expected = { standard: 90, short: 45, long: 180, flow: 5 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });

    test('handles mixed-case keys and extra whitespace', () => {
      const input = "  sTandArd:   1:00 | SHORT:  30 |   lOnG:2:00  ";
      const expected = { standard: 60, short: 30, long: 120, flow: 5 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });
    

    test('parses Flow hold values alongside other tiers', () => {
      const input = "Standard: 0:45 | Short: 0:15 | Long: 3:00 | Flow: 0:05";
      const expected = { standard: 45, short: 15, long: 180, flow: 5 };
      assert.deepStrictEqual(parseHoldTimes(input), expected);
    });

    test('handles malformed input gracefully by retaining defaults for missing parts', () => {
      const input = "Standard: 1:00 | Gibberish | Long: 120";
      const expected = { standard: 60, short: 15, long: 120, flow: 5 };
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

    test('optionally includes Flow in built hold strings', () => {
      assert.strictEqual(buildHoldString(90, 45, 180, 5), "Standard: 1:30 | Short: 0:45 | Long: 3:00 | Flow: 0:05");
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

    test('normalises lowercase Roman numerals in brackets (e.g. [iia] → "IIA")', () => {
      // Fix: variationMatch regex uses /i flag so [iia] is captured and uppercased
      const input = '053 | 60 | [iia] supported version';
      const result = parseSequenceText(input);
      assert.strictEqual(result[0][3], 'IIa', 'lowercase [iia] should preserve lowercase suffix as "IIa"');
    });

    test('normalises multi-char Roman numerals like IVa and IX', () => {
      const cases = [
        { line: '001 | 30 | [IVa] chair version', expected: 'IVa' },
        { line: '001 | 30 | [IX]',               expected: 'IX'  },
        { line: '001 | 30 | [IVb] wall support',  expected: 'IVb' },
      ];
      for (const { line, expected } of cases) {
        const result = parseSequenceText(line);
        assert.strictEqual(result[0][3], expected, `Expected "${expected}" from: ${line}`);
      }
    });

    test('skips and warns on malformed IDs with Roman in ID column ("53 II", "53II")', () => {
      // These are data-entry errors — stage belongs in note, not appended to ID.
      // The parser should skip the row (return empty), not insert an unresolvable ghost pose.
      const badInputs = [
        '53 II | 60 | basic hold',   // space-separated Roman in ID column
        '53II  | 60 | basic hold',   // concatenated Roman in ID column
      ];
      for (const line of badInputs) {
        const result = parseSequenceText(line);
        assert.strictEqual(result.length, 0, `Expected malformed line to be skipped: "${line}"`);
      }
    });
  });
});