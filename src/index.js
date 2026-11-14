// One resolver for every RecallReady UI module.
import Resolver from '@forge/resolver';
import { defineAdmin } from './resolvers/admin.js';
import { defineBoard } from './resolvers/board.js';
import { definePanel } from './resolvers/panel.js';

const resolver = new Resolver();
defineAdmin(resolver);
defineBoard(resolver);
definePanel(resolver);

export const handler = resolver.getDefinitions();
export { sampleLoader } from './consumers.js';
export { radarTrigger } from './triggers.js';
