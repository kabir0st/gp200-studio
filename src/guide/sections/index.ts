import type { ComponentType } from 'react';
import { OverviewBody } from './overview';
import { EditorBody } from './editor';
import { PedalsBody } from './pedals';
import { DeckBody } from './deck';
import { DrawersBody } from './drawers';
import { BulkBody } from './bulk';
import { LooperBody } from './looper';
import { DrumsBody } from './drums';
import { RemoteBody } from './remote';
import { PatchesBody } from './patches';
import { ConnectBody } from './connect';
import { FilesBody } from './files';
import { RequirementsBody } from './requirements';

/**
 * Section slug → body component. Static imports on purpose: these are the only
 * modules the prerenderer renders, and a lazy() boundary would make them
 * unreachable from renderToStaticMarkup.
 *
 * Everything imported transitively from here must be SSR-safe — no module-scope
 * window/document/AudioContext, no gsap. tests/unit/prerenderSafety.test.ts
 * enforces that under a node environment.
 */
export const SECTION_BODIES: Readonly<Record<string, ComponentType>> = {
  overview: OverviewBody,
  'pedalboard-editor': EditorBody,
  'changing-effects': PedalsBody,
  'control-deck': DeckBody,
  'patch-settings': DrawersBody,
  'bulk-apply': BulkBody,
  'loop-station': LooperBody,
  'drum-machine': DrumsBody,
  'midi-remote': RemoteBody,
  'managing-patches': PatchesBody,
  'connect-gp-200': ConnectBody,
  'prst-files': FilesBody,
  requirements: RequirementsBody,
};
