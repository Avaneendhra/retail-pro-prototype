import { it, expect } from 'vitest';
import { isDesktopSiteOnPhone } from './desktopSite.js';

it('a phone whose browser lays the page out 980 px wide is in "Desktop site" mode', () => {
  expect(isDesktopSiteOnPhone({ screenWidth: 412, screenHeight: 915, pageWidth: 980, touch: true })).toBe(true);
  expect(isDesktopSiteOnPhone({ screenWidth: 915, screenHeight: 412, pageWidth: 1280, touch: true })).toBe(true);
});

it('a phone showing the page at its own width is fine, upright or turned sideways', () => {
  expect(isDesktopSiteOnPhone({ screenWidth: 412, screenHeight: 915, pageWidth: 412, touch: true })).toBe(false);
  expect(isDesktopSiteOnPhone({ screenWidth: 915, screenHeight: 412, pageWidth: 915, touch: true })).toBe(false);
});

it('tablets and computers are left alone', () => {
  expect(isDesktopSiteOnPhone({ screenWidth: 800, screenHeight: 1280, pageWidth: 1280, touch: true })).toBe(false);
  expect(isDesktopSiteOnPhone({ screenWidth: 1920, screenHeight: 1080, pageWidth: 1920, touch: false })).toBe(false);
  expect(isDesktopSiteOnPhone({ screenWidth: 412, screenHeight: 915, pageWidth: 980, touch: false })).toBe(false);
});
