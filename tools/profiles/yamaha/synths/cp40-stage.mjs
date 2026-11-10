// Yamaha CP40 STAGE: the CP4 STAGE/CP40 STAGE data list, laid out as the CP4 STAGE's with the CP40
// STAGE's model ID (7F 1B) and identity code (4A 06).
import { cpStage } from './cp4-stage.mjs';

export default cpStage({ id: 'yamaha-cp40-stage', name: 'Yamaha CP40 STAGE', description: 'Yamaha CP40 STAGE stage piano: every parameter change table of its data list (System, the Performance and its three parts and four zones), identity, and Pull from the Performance edit buffer.', model: '1B', family: '4A' });
