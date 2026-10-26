import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScannerPixelEffects, deterministicScannerRotation, scannerPageSeed, transformRgba } from '../ui/visual-effects.js';

test('color transforms preserve alpha and apply grayscale/invert deterministically', () => {
  const source = new Uint8ClampedArray([100, 150, 200, 77]);
  assert.deepEqual([...transformRgba(source, { mode: 'grayscale' })], [143, 143, 143, 77]);
  assert.deepEqual([...transformRgba(source, { mode: 'invert' })], [155, 105, 55, 77]);
  assert.deepEqual([...source], [100, 150, 200, 77]);
});

test('high contrast transform separates foreground from background using threshold', () => {
  const source = new Uint8ClampedArray([20, 20, 20, 255, 240, 240, 240, 255]);
  assert.deepEqual([...transformRgba(source, { mode: 'white-on-black', threshold: 160 })], [255, 255, 255, 255, 0, 0, 0, 255]);
});

test('scanner effects are repeatable per page and validate raster bounds', () => {
  const source = new Uint8ClampedArray([130, 100, 70, 255, 240, 240, 240, 255]);
  const options = { colorspace: 'grayscale', brightness: 1.05, contrast: 1.1, noise: 1.5, yellowish: true, seed: scannerPageSeed(2) };
  const first = applyScannerPixelEffects(source, 2, 1, options);
  const second = applyScannerPixelEffects(source, 2, 1, options);
  assert.deepEqual([...first], [...second]);
  assert.notEqual(scannerPageSeed(2), scannerPageSeed(3));
  assert.equal(deterministicScannerRotation(0, 'none'), 0);
  assert.equal(deterministicScannerRotation(4, 'moderate'), deterministicScannerRotation(4, 'moderate'));
  assert.throws(() => applyScannerPixelEffects(source, 3, 1, options), /Kích thước raster/);
});
