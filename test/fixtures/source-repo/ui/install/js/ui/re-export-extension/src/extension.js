// Indirect re-export: imported from an external extension, then exported back.
// In Bitrix IIFE bundles that share a namespace this must compile to a plain
// assignment, not to a live-binding getter (see externalLiveBindings option).
import { Foo } from 'some.external.extension';

export { Foo };

export const Local = 'local';
