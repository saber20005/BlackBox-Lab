// Standalone pages share the local display choice without loading account or progress services.
import { readBbPreferences, applyBbPreferences } from './ui-preferences.js';

applyBbPreferences(readBbPreferences());
