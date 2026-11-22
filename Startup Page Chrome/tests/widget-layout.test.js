import test from "node:test";
import assert from "node:assert/strict";
import { freePosition } from "../js/widget-layout.js";

test("widget placement preserves arbitrary empty points and a gutter around content", () => {
  const size = { width: 80, height: 50 },
    area = { width: 500, height: 400 };
  const blocked = [{ x: 100, y: 100, width: 200, height: 100 }];
  assert.deepEqual(freePosition({ x: 14.5, y: 225.2 }, size, area, blocked), {
    x: 14.5,
    y: 225.2,
  });
  assert.deepEqual(freePosition({ x: 101, y: 91 }, size, area, blocked), {
    x: 101,
    y: 40,
  });
  assert.deepEqual(freePosition({ x: 999, y: -22 }, size, area, blocked), {
    x: 410,
    y: 10,
  });
  assert.equal(
    freePosition({ x: 40, y: 50 }, size, area, [{ x: 0, y: 0, ...area }]),
    null,
  );
  assert.equal(
    freePosition({ x: 0, y: 0 }, size, { width: 65, height: 48 }, []),
    null,
  );
});
