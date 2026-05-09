import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ratingOverlayOptionsForCompletion } from './completionFlow.js';

describe('completion flow helpers', () => {
  test('keeps manual completion rating overlay on the default reset path', () => {
    assert.deepStrictEqual(ratingOverlayOptionsForCompletion(null), {});
    assert.deepStrictEqual(ratingOverlayOptionsForCompletion({}), {});
  });

  test('loads the next curriculum practice after curriculum completion rating', () => {
    assert.deepStrictEqual(
      ratingOverlayOptionsForCompletion({ curriculum_node_id: 786 }),
      {
        afterRatingAction: 'startTodayPractice',
        resetAfterRating: false,
      },
    );
  });
});
