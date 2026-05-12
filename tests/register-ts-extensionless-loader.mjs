import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./tests/ts-extensionless-loader.mjs', pathToFileURL('./'));
