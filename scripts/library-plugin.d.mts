import type { Plugin } from 'vite';
import type { LibraryPluginOptions } from '../src/library/plugin';

export function riglabLibrary(options: LibraryPluginOptions): Promise<Plugin>;
