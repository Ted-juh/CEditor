// Yamaha CP50: the CP5/CP50 data list laid out for the CP50 (cp5.mjs): its two parts, and not what
// the data list marks `(CP5 only)`, the Power-Amplifier/Insertion 2 blocks and the A/D input part.
import { cpFive } from './cp5.mjs';

export default cpFive({
  id: 'yamaha-cp50',
  name: 'Yamaha CP50',
  description: 'Yamaha CP50 stage piano: every parameter change table of its data list (System, the Performance with its two parts, Backing Part and four zones), identity, and Pull from the Performance edit buffer.',
  model: '11',
  family: '40',
  parts: ['L', 'R'],
  absent: {
    34: 'the Power-Amplifier/Insertion 2 blocks, which the data list marks CP5 only',
    36: 'the A/D (mic) input part and its effects, which the data list marks CP5 only',
  },
});
