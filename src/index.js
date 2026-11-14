// One resolver for every RecallReady UI module.
import Resolver from '@forge/resolver';
import { defineAdmin } from './resolvers/admin.js';

const resolver = new Resolver();
defineAdmin(resolver);

export const handler = resolver.getDefinitions();
export { sampleLoader } from './consumers.js';
