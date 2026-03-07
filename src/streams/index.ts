import type { StreamPlugin } from '@/types/stream';
import { wikipediaPlugin } from './wikipedia';
import { createFlightPlugin } from './flights';
import { createWeatherPlugin } from './weather';
import { createRssPlugin } from './rss';
import { cryptoPlugin } from './crypto';

export function createPlugins(lat: number, lon: number): StreamPlugin[] {
  return [
    createWeatherPlugin(lat, lon),
    createFlightPlugin(lat, lon),
    wikipediaPlugin,
    createRssPlugin(),
    cryptoPlugin,
  ];
}
