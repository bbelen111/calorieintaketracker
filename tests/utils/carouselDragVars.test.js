import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publishCarouselDragVars,
  registerCarouselDragVarSink,
  resetCarouselDragVars,
} from '../../src/utils/visuals/carouselDragVars.js';
import {
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
} from '../../src/utils/visuals/carouselLoop.js';

/**
 * The swipe shell writes the live drag variables onto the registered chrome
 * elements (the tab bar + header dots), never `:root` — an inherited custom
 * property on `:root` invalidates style for the whole document on every drag
 * frame. These cases pin the sink contract with a lightweight element double.
 */
const createSink = () => {
  const values = new Map();
  let writes = 0;

  return {
    values,
    get writes() {
      return writes;
    },
    style: {
      setProperty(name, value) {
        writes += 1;
        values.set(name, String(value));
      },
    },
  };
};

const withRegistry = (run) => {
  resetCarouselDragVars();
  try {
    run();
  } finally {
    resetCarouselDragVars();
  }
};

test('publishes the position + duration onto registered sinks', () => {
  withRegistry(() => {
    const sink = createSink();
    registerCarouselDragVarSink(sink);

    publishCarouselDragVars(3.4, '0s');

    assert.equal(sink.values.get(SCREEN_DRAG_PROGRESS_VAR), '3.4000');
    assert.equal(sink.values.get(SCREEN_DRAG_DURATION_VAR), '0s');
  });
});

test('seeds a sink that registers after a publish', () => {
  withRegistry(() => {
    publishCarouselDragVars(2, '350ms');

    const lateSink = createSink();
    registerCarouselDragVarSink(lateSink);

    assert.equal(lateSink.values.get(SCREEN_DRAG_PROGRESS_VAR), '2.0000');
    assert.equal(lateSink.values.get(SCREEN_DRAG_DURATION_VAR), '350ms');
  });
});

test('an identical republish is a no-op (no redundant style writes)', () => {
  withRegistry(() => {
    const sink = createSink();
    registerCarouselDragVarSink(sink);

    publishCarouselDragVars(1, '0s');
    const afterFirst = sink.writes;

    publishCarouselDragVars(1, '0s');

    assert.equal(sink.writes, afterFirst);
  });
});

test('unregistering stops updates', () => {
  withRegistry(() => {
    const sink = createSink();
    const unregister = registerCarouselDragVarSink(sink);
    unregister();

    publishCarouselDragVars(4, '0s');

    assert.equal(sink.writes, 0);
  });
});

test('a null sink is ignored', () => {
  withRegistry(() => {
    const unregister = registerCarouselDragVarSink(null);
    assert.equal(typeof unregister, 'function');
    unregister();
  });
});
