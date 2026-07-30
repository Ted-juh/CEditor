// apiExamples.mjs — the derived half of the reference examples (design doc §47).
//
// Every member here is a function of its arguments and nothing else, so the example can state its
// RESULT — and none of these numbers was typed by hand. They were produced by running the real
// implementation through the live api, and apiExamples.test.js re-runs every one and fails if the
// answer has changed. A documented result the code no longer produces is a lie the suite refuses to
// let ship, which is the only way a page full of numbers stays trustworthy.
//
// Deriving them also found three things wrong with the contract itself: blend()'s signature said
// `blend(a, b, t)` with no hint that a and b are LISTS (two numbers return an empty list, which is
// correct and baffling), and decodeJson()'s summary never mentioned that JSON null reads as nothing
// — the one surprising thing about it. Both are fixed in panelApi.js.
//
// Format: flatMemberId: [[...args], result]
//
// To change one: edit the ARGS, re-run the deriver, and let the implementation say what the result
// is. Never edit a result to make a test pass.

export const PURE = {
  scale: [[0.5,0,1,20,20000], 10010],
  clamp: [[1.4,0,1], 1],
  round: [[2.5], 3],
  snap: [[7.3,0.5], 7.5],
  curve: [[0.5,"exp"], 0.25],
  lerp: [[100,200,0.25], 125],
  wrap: [[13,0,12], 1],
  mapCurve: [[0.5,[[0,0],[0.25,0.8],[1,1]]], 0.8666666666666667],
  quantizeTo: [[0.42,[0,0.25,0.5,0.75,1]], 0.5],
  dbToGain: [[-6], 0.5011872336272722],
  gainToDb: [[0.5], -6.020599913279624],
  norm: [[64,0,127], 0.5039370078740157],
  denorm: [[0.5,20,20000], 10010],
  bipolar: [[0.75], 0.5],
  unipolar: [[-0.5], 0.25],
  fold: [[1.3,0,1], 0.7],
  indexOfRange: [[0.62,5], 3],
  crossfade: [[0,1,0.5,"equalPower"], 0.7071067811865475],
  approach: [[10,100,25], 35],
  roundTo: [[3.14159,2], 3.14],
  almost: [[0.30000000000000004,0.3], true],
  minOf: [[[5,-2,9]], -2],
  maxOf: [[[5,-2,9]], 9],
  sumOf: [[[1,2,3,4]], 10],
  meanOf: [[[1,2,3,4]], 2.5],
  blend: [[[0,64,127],[127,64,0],0.25], [31.75,64,95.25]],
  lighten: [["3A6EA5",0.2], "#618BB7"],
  darken: [["3A6EA5",0.2], "#0C1621"],
  mixColour: [["FF0000","0000FF",0.5], "#800080"],
  colourAlpha: [["3A6EA5",0.5], "803A6EA5"],
  hexToRgb: [["3A6EA5"], {"r":58,"g":110,"b":165}],
  rgbToHex: [[58,110,165], "#3A6EA5"],
  hexToHsl: [["3A6EA5"], {"h":210.8411214953271,"s":47.98206278026906,"l":43.72549019607843}],
  hslToHex: [[210,48,44], "#3A70A6"],
  toDegrees: [[1.5707963267948966], 90],
  toRadians: [[180], 3.141592653589793],
  distance: [[0,0,3,4], 5],
  angleOf: [[0,0,0,-10], 0],
  polar: [[90,10], {"x":10,"y":-6.123233995736766e-16}],
  shapeCurve: [[0.5,"log"], 0.8350615111533882],
  deadzone: [[0.05,0.1], 0],
  weightsFor: [[[[0,0],[100,0],[50,100]],50,50], [0.3333333333333333,0.3333333333333333,0.3333333333333333]],
  blendBy: [[[0,50,100],[0.5,0.25,0.25]], 37.5],
  tickStops: [[4,2], {"major":[0,0.3333333333333333,0.6666666666666666,1],"minor":[0.1111111111111111,0.2222222222222222,0.4444444444444444,0.5555555555555556,0.7777777777777777,0.8888888888888888]}],
  dbPosition: [[0.5], 0.8178696982836421],
  smooth: [[0,100,0.5], 50],
  hysteresis: [[0.6,false,0.4,0.7], false],
  median: [[[5,1,9,3]], 4],
  unshape: [[0.7,"log"], 0.37064919755159165],
  euclid: [[8,3], [false,false,true,false,false,true,false,true]],
  noteName: [[60], "C4"],
  noteNumber: [["C4"], 60],
  scaleNotes: [[60,"dorian"], [60,62,63,65,67,69,70]],
  chordNotes: [[60,"min7"], [60,63,67,70]],
  quantizeNote: [[61,60,"major"], 62],
  noteSpelling: [[60,"major"], false],
  inScale: [[61,60,"major"], false],
  scaleDegree: [[64,60,"major"], 3],
  degreeChord: [[60,"major",5], {"degree":5,"rootNote":67,"quality":"maj","name":"G","roman":"V","offsets":[7,11,14],"notes":[67,71,74],"names":["G","B","D"]}],
  chordQuality: [[[60,63,67]], "min"],
  voiceLead: [[[60,64,67],[72,76,79]], [72,76,79]],
  expandOctaves: [[[60,64,67],2], [60,64,67,72,76,79]],
  arpOrder: [[[60,64,67],"downup"], [[67],[64],[60],[64]]],
  to7bit: [[1000,2,"msb"], [7,104]],
  from7bit: [[[7,104],"msb"], 1000],
  to14bit: [[1000], {"msb":7,"lsb":104}],
  from14bit: [[7,104], 1000],
  toNibbles: [[165], {"hi":10,"lo":5}],
  fromNibbles: [[10,5], 165],
  nibblize: [[[165,60]], [10,5,3,12]],
  denibblize: [[[10,5,3,12]], [165,60]],
  toAscii: [["Bass",8], [66,97,115,115,32,32,32,32]],
  fromAscii: [[[66,97,115,115]], "Bass"],
  toOffset: [[-12,64], 52],
  fromOffset: [[52,64], -12],
  toSigned: [[-3,7], 125],
  fromSigned: [[125,7], -3],
  checksum: [["roland",[64,0,127]], 65],
  beatsPerDivision: [["1/16"], 0.25],
  divisionNames: [[], [{"id":"1/1","label":"Whole","beats":4},{"id":"1/2","label":"Half","beats":2},{"id":"1/4","label":"Quarter","beats":1},{"id":"1/8","label":"8th","beats":0.5},{"id":"1/16","label":"16th","beats":0.25},{"id":"1/32","label":"32nd","beats":0.125},{"id":"1/2D","label":"Half ·","beats":3},{"id":"1/4D","label":"Quarter ·","beats":1.5},{"id":"1/8D","label":"8th ·","beats":0.75},{"id":"1/16D","label":"16th ·","beats":0.375},{"id":"1/2T","label":"Half T","beats":1.3333333333333333},{"id":"1/4T","label":"Quarter T","beats":0.6666666666666666},{"id":"1/8T","label":"8th T","beats":0.3333333333333333},{"id":"1/16T","label":"16th T","beats":0.16666666666666666}]],
  barBeatAt: [[9.5,4], {"bar":3,"beat":2,"tick":12,"text":"3.2.12"}],
  stepAt: [[2.5,"1/8"], 5],
  stepsBetween: [[0,1,"1/16"], {"steps":[1,2,3,4],"dropped":0}],
  swingOffset: [[1,0.6,"1/8"], 0.15],
  cycleAt: [[9.5,2,4], {"phase":0.1875,"count":1,"length":8}],
  loopedBeats: [[9.5,8,4], {"beats":9.5,"pass":0}],
  clockTempo: [[[20.83,20.83,20.84]], 120.0192030724916],
  tapTempo: [[[0,500,1000,1500]], 120],
  encodeJson: [[{"a":1,"b":[true,2]}], "{\"a\":1,\"b\":[true,2]}"],
  decodeJson: [["{\"a\":1,\"b\":[true,2]}"], {"a":1,"b":[true,2]}],
};

export { WRITTEN } from './apiExamplesWritten.mjs';
