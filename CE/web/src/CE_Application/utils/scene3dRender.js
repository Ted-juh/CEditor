// scene3dRender.js — a 3D part's recipe (utils/scene3dModel.js) rendered by three.js (MIT) from
// straight above into the passes utils/scene3dLayers.js turns into the Blender add-on's layers.
// In the editor only, loaded when a 3D part is rendered; the Player and the plug-in draw the layers.
//
// For each object, with the others held out (they hide it where they are above it, and are not
// drawn): its coverage and colour (unlit), and its light twice, once in white and once in black. A
// physically based material is linear in its base colour, so the difference is the light on it
// without its colour and the black render its gloss: the add-on's `light` and `gloss` (a metal's
// colour is what it reflects, so its gloss is nothing and its light all it reflects). Rendered three
// times the size and averaged, so that a pixel's coverage is its share of the samples. The shadow on
// the panel is the panel lit with what stays put casting and without; a turning object's shadow, on
// the panel and on what stays put, likewise, at each angle. A turning object that is not round is
// rendered at each angle and turned back to rest. Lit by the set's lamp (renderedLookCore.js
// lampDirection), a fill, and a studio to reflect (three's RoomEnvironment), as piece E is.

import { buildSceneLayers, turnImage, TURN_ANGLES } from './scene3dLayers.js';
import { FINISH_MATERIAL, isRound, layerNameOf, normalizeScene3d } from './scene3dModel.js';
import { lampDirection } from './renderedLookCore.js';

const SUPERSAMPLE = 3;
let threeModules = null;

/** three.js and the parts of its examples used here, loaded once. */
export function loadThree() {
  threeModules ??= Promise.all([
    import('three'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
  ]).then(([THREE, { RoomEnvironment }, { RoundedBoxGeometry }]) => ({ THREE, RoomEnvironment, RoundedBoxGeometry }));
  return threeModules;
}

// Each render is handed back to the page between: without a graphics card one takes a fraction of a
// second, and a part's dozens would hold the editor still for as many seconds.
const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

const hexRgb = (argb) => [1, 3, 5].map((i) => parseInt(String(argb).slice(2).slice(i - 1, i + 1), 16) / 255);

// --- Shapes ---------------------------------------------------------------------------------------------

/**
 * A turned body as a lathe about the knob's axis (three's y, turned to z after): radius `r` at the
 * foot to `r·(1 − taper)` at the top, its edges rounded, knurled or fluted round the side between
 * them, its top flat, domed or dished. Units: pixels of the render.
 */
function turnedGeometry(THREE, { r, z0, height, taper, side, ridges, depth, top }) {
  const rTop = r * (1 - taper / 100);
  const bevel = Math.min(height * 0.3, r * 0.08, 6);
  const points = [];
  const add = (x, y) => points.push(new THREE.Vector2(Math.max(0, x), y));
  add(0, z0);
  add(r - bevel, z0);
  for (let i = 1; i <= 4; i += 1) {
    const a = (i / 4) * (Math.PI / 2);
    add(r - bevel + Math.sin(a) * bevel, z0 + bevel - Math.cos(a) * bevel);
  }
  const zTop = z0 + height;
  add(rTop, zTop - bevel);
  for (let i = 1; i <= 4; i += 1) {
    const a = (i / 4) * (Math.PI / 2);
    add(rTop - bevel + Math.cos(a) * bevel, zTop - bevel + Math.sin(a) * bevel);
  }
  const inner = rTop - bevel;
  const rim = top === 'insert' ? inner * 0.82 : inner;
  if (top === 'dome') {
    for (let i = 1; i <= 12; i += 1) {
      const a = (i / 12) * (Math.PI / 2);
      add(inner * Math.cos(a), zTop + Math.sin(a) * inner * 0.22);
    }
  } else if (top === 'dish') {
    for (let i = 1; i <= 12; i += 1) {
      const a = (i / 12) * (Math.PI / 2);
      add(inner * Math.cos(a), zTop - Math.sin(a) * Math.min(inner * 0.12, height * 0.4));
    }
  } else {
    add(rim, zTop);
    if (top === 'insert') {
      // A step down into the insert, which is a disc of its own (topMaterial).
      add(rim, zTop - Math.min(1.5, height * 0.1));
      add(0, zTop - Math.min(1.5, height * 0.1));
    } else {
      add(0, zTop);
    }
  }
  const segments = side === 'smooth' ? 96 : Math.min(720, Math.max(96, ridges * 8));
  const geometry = new THREE.LatheGeometry(points, segments);
  if (side !== 'smooth') {
    // Ridges round the side, between a chamfer at the foot and one at the top.
    const position = geometry.attributes.position;
    const band = (y) => Math.min(1, Math.max(0, (y - z0 - bevel) / Math.max(bevel, 1))) * Math.min(1, Math.max(0, (zTop - bevel - y) / Math.max(bevel, 1)));
    const amount = (depth / 100) * r;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i); const y = position.getY(i); const z = position.getZ(i);
      const radius = Math.hypot(x, z);
      if (radius < 1e-6) continue;
      const angle = Math.atan2(z, x);
      const t = ((angle * ridges) / (2 * Math.PI)) % 1;
      const wave = side === 'knurled' ? 1 - Math.abs(((t + 1) % 1) - 0.5) * 2 : 0.5 + 0.5 * Math.cos(angle * ridges);
      const out = side === 'knurled' ? amount * wave : -amount * (1 - wave);
      const k = band(y) * (radius >= rTop - bevel * 1.01 ? 1 : 0);
      if (!k) continue;
      const s = (radius + out * k) / radius;
      position.setX(i, x * s);
      position.setZ(i, z * s);
    }
    geometry.computeVertexNormals();
  }
  geometry.rotateX(Math.PI / 2);
  return { geometry, insert: top === 'insert' ? { r: rim, z: zTop - Math.min(1.5, height * 0.1), thickness: Math.min(1.5, height * 0.1) } : null };
}

/** An object's mesh (a group, for a body with an insert), in pixels of the render, its axis at the origin. */
function objectMesh(three, object, size, material) {
  const { THREE, RoundedBoxGeometry } = three;
  const R = size / 2;
  const shape = object.shape;
  const group = new THREE.Group();
  if (shape.kind === 'turned') {
    const { geometry, insert } = turnedGeometry(THREE, {
      r: (shape.diameter / 100) * R, z0: (shape.base / 100) * R, height: (shape.height / 100) * R,
      taper: shape.taper, side: shape.side, ridges: shape.ridges, depth: shape.depth, top: shape.top,
    });
    group.add(new THREE.Mesh(geometry, material));
    if (insert) {
      const disc = new THREE.CylinderGeometry(insert.r, insert.r, insert.thickness * 2, 96);
      disc.rotateX(Math.PI / 2);
      disc.translate(0, 0, insert.z);
      group.add(new THREE.Mesh(disc, material));
    }
  } else if (shape.kind === 'block') {
    const w = (shape.width / 100) * size; const l = (shape.length / 100) * size; const h = (shape.height / 100) * R;
    const geometry = new RoundedBoxGeometry(w, l, h, 4, Math.min((shape.corner / 100) * Math.min(w, l), h / 2));
    geometry.translate(0, 0, (shape.base / 100) * R + h / 2);
    group.add(new THREE.Mesh(geometry, material));
  } else if (shape.kind === 'pointer') {
    const length = (shape.length / 100) * size; const width = (shape.width / 100) * size;
    const from = (shape.from / 100) * size; const z = (shape.base / 100) * R; const h = (shape.height / 100) * R;
    let geometry;
    if (shape.style === 'dot') {
      geometry = new THREE.CylinderGeometry(width / 2, width / 2, h, 48);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, from + length - width / 2, z + h / 2);
    } else if (shape.style === 'chicken-head') {
      // A long tapered head across the knob, its point at the top.
      const outline = new THREE.Shape();
      const tail = length * 0.45;
      outline.moveTo(-width / 2, -tail);
      outline.quadraticCurveTo(-width / 2, -tail - width * 0.6, 0, -tail - width * 0.6);
      outline.quadraticCurveTo(width / 2, -tail - width * 0.6, width / 2, -tail);
      outline.lineTo(width * 0.14, length);
      outline.lineTo(-width * 0.14, length);
      outline.closePath();
      geometry = new THREE.ExtrudeGeometry(outline, { depth: h, bevelEnabled: true, bevelThickness: Math.min(h * 0.3, 4), bevelSize: Math.min(width * 0.08, 3), bevelSegments: 4, curveSegments: 24 });
      geometry.translate(0, 0, z);
    } else {
      const bar = shape.style === 'bar';
      geometry = new RoundedBoxGeometry(width, length, h, 3, Math.min(width / (bar ? 2.2 : 2.5), h / 2));
      geometry.translate(0, from + length / 2, z + h / 2);
    }
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

// --- Rendering ---------------------------------------------------------------------------------------------

/**
 * Render a recipe into layers. `width`, `height`: the part's size in the component's pixels; the
 * layers are drawn at `scale` times that (crisp when the component is drawn larger). `lamp`: the set's
 * ({ azimuth, elevation }). `meshes`: name → a three Object3D for objects whose shape is a mesh (a glTF's).
 * Returns { width, height, layers, colourOf, metal, linearEdges, milliseconds } for scenePsdBytes, or
 * throws when WebGL 2 is not there.
 */
export async function renderScene3d(recipeIn, { width, height, scale = 2, lamp = null, meshes = {} } = {}) {
  const started = Date.now();
  const three = await loadThree();
  const { THREE, RoomEnvironment } = three;
  const recipe = normalizeScene3d(recipeIn);
  const w = Math.max(16, Math.round(width * scale));
  const h = Math.max(16, Math.round(height * scale));
  const W = w * SUPERSAMPLE; const H = h * SUPERSAMPLE;
  const n = w * h;
  const size = Math.min(w, h);

  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('3D parts need WebGL 2.');
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 4000);
    camera.position.set(0, 0, 2000);
    camera.lookAt(0, 0, 0);

    const [lx, ly, lz] = lampDirection(lamp);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(lx * 1500, ly * 1500, lz * 1500);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -w, right: w, top: h, bottom: -h, near: 1, far: 5000 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.6;
    key.shadow.radius = 3;
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-lx * 1000, -ly * 1000, 900);
    scene.add(fill);

    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, h * 4), panelMaterial);
    panel.receiveShadow = true;
    scene.add(panel);

    const holdout = new THREE.MeshBasicMaterial({ colorWrite: false });
    const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const physical = (object, base) => {
      const finish = FINISH_MATERIAL[object.material.finish];
      return new THREE.MeshPhysicalMaterial({
        color: base, metalness: object.material.metalness != null ? object.material.metalness / 100 : finish.metalness,
        roughness: object.material.roughness / 100, clearcoat: finish.clearcoat, clearcoatRoughness: 0.12,
      });
    };
    const colourOf = (object) => new THREE.Color().setRGB(...hexRgb(object.material.colour), THREE.SRGBColorSpace);

    // Each object's mesh, under a group that turns it about the axis.
    const placed = recipe.objects.map((object) => {
      const pivot = new THREE.Group();
      let mesh;
      if (object.shape.kind === 'mesh') {
        // A model's object, its axis at the origin and its farthest point at 1 (utils/scene3dGltf.js).
        const model = (meshes[object.shape.node] ?? meshes[object.name])?.clone(true);
        if (model) {
          mesh = new THREE.Group();
          mesh.add(model);
          mesh.scale.setScalar((size / 2) * 0.97);
        }
      } else {
        mesh = objectMesh(three, object, size, holdout);
      }
      if (mesh) pivot.add(mesh);
      scene.add(pivot);
      const each = [];
      pivot.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; each.push(node); } });
      return { object, pivot, meshes: each };
    });
    const setMaterial = (entry, material, order = 0) => {
      for (const mesh of entry.meshes) { mesh.material = material; mesh.renderOrder = order; }
    };

    const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace });
    const pixels = new Float32Array(W * H * 4);
    /** The scene as it is set, read back and averaged down: { rgb (premultiplied), alpha }. */
    const read = async () => {
      await yieldToPage();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
      renderer.setRenderTarget(null);
      const rgb = new Float32Array(n * 3);
      const alpha = new Float32Array(n);
      const k = 1 / (SUPERSAMPLE * SUPERSAMPLE);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let r = 0; let g = 0; let b = 0; let a = 0;
          for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
            // The render's first row is its bottom.
            const row = H - 1 - (y * SUPERSAMPLE + sy);
            for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
              const i = (row * W + x * SUPERSAMPLE + sx) * 4;
              r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; a += pixels[i + 3];
            }
          }
          const p = y * w + x;
          rgb[p * 3] = r * k; rgb[p * 3 + 1] = g * k; rgb[p * 3 + 2] = b * k;
          alpha[p] = a * k;
        }
      }
      return { rgb, alpha };
    };
    const perCovered = (rgb, alpha) => Float32Array.from(rgb, (v, i) => (alpha[(i / 3) | 0] > 1e-4 ? v / alpha[(i / 3) | 0] : 0));

    /** An object's passes, with the others held out and the panel away. */
    const passesOf = async (entry) => {
      panel.visible = false;
      for (const other of placed) if (other !== entry) setMaterial(other, holdout, -1);
      const object = entry.object;
      setMaterial(entry, new THREE.MeshBasicMaterial({ color: colourOf(object) }));
      const flat = await read();
      setMaterial(entry, physical(object, new THREE.Color(1, 1, 1)));
      const white = await read();
      setMaterial(entry, physical(object, new THREE.Color(0, 0, 0)));
      const black = await read();
      const alpha = flat.alpha;
      const colour = perCovered(flat.rgb, alpha);
      const lit = perCovered(white.rgb, alpha);
      const gloss = perCovered(black.rgb, alpha);
      const light = Float32Array.from(lit, (v, i) => Math.max(0, v - gloss[i]));
      let glow = null;
      if (object.motion === 'lamp') {
        // A lit lamp's own light: its colour, bright.
        glow = Float32Array.from(colour, (v, i) => (alpha[(i / 3) | 0] > 0 ? v * 1.6 : 0));
      }
      return { alpha, colour, light, gloss, glow };
    };

    /**
     * How much `casting` darken the panel (and `alsoSeen`, drawn) by their shadows: 0 to 1, linear.
     * `bare`: the same without their shadows, when it is already made (it does not change as they turn).
     */
    const shadowOf = async (casting, alsoSeen = [], bareMade = null) => {
      for (const entry of placed) setMaterial(entry, alsoSeen.includes(entry) ? physical(entry.object, colourOf(entry.object)) : unseen);
      panel.visible = true;
      panel.material = panelMaterial;
      for (const entry of placed) for (const mesh of entry.meshes) mesh.castShadow = casting.includes(entry);
      const lit = await read();
      for (const entry of placed) for (const mesh of entry.meshes) mesh.castShadow = false;
      const bare = bareMade ?? await read();
      lastBare = bare;
      for (const entry of placed) for (const mesh of entry.meshes) mesh.castShadow = true;
      const out = new Float32Array(n);
      for (let p = 0; p < n; p += 1) {
        const with_ = 0.2126 * lit.rgb[p * 3] + 0.7152 * lit.rgb[p * 3 + 1] + 0.0722 * lit.rgb[p * 3 + 2];
        const without = 0.2126 * bare.rgb[p * 3] + 0.7152 * bare.rgb[p * 3 + 1] + 0.0722 * bare.rgb[p * 3 + 2];
        out[p] = without > 1e-5 ? Math.min(1, Math.max(0, 1 - with_ / without)) : 0;
      }
      return out;
    };

    let lastBare = null;
    const kindOf = (object) => (object.motion === 'turns' ? (isRound(object) ? 'rotor' : 'turns') : object.motion);
    // Bottom first: by where each stands, then by height.
    const ordered = [...placed].sort((a, b) => {
      const top = (entry) => {
        const box = new THREE.Box3().setFromObject(entry.pivot);
        return Number.isFinite(box.max.z) ? box.max.z : 0;
      };
      return top(a) - top(b);
    });
    const still = ordered.filter((entry) => kindOf(entry.object) !== 'turns');
    const turning = ordered.filter((entry) => kindOf(entry.object) === 'turns');
    const axis = [w / 2, h / 2];

    // What stays put: at rest, the turning objects away (they cast their own shadows, below).
    for (const entry of turning) entry.pivot.visible = false;
    const objects = [];
    for (const entry of still) {
      objects.push({ name: layerNameOf(entry.object), motion: kindOf(entry.object), metal: (entry.object.material.metalness ?? FINISH_MATERIAL[entry.object.material.finish].metalness * 100) > 50, passes: await passesOf(entry) });
    }
    const shadow = still.length ? await shadowOf(still) : null;
    for (const entry of turning) entry.pivot.visible = true;

    // What turns, at each angle, turned back to rest; and its shadow on the panel and what stays put.
    let turnShadows = null;
    let shadowPivot = null;
    if (turning.length) {
      turnShadows = {};
      const topZ = Math.max(...turning.map((entry) => new THREE.Box3().setFromObject(entry.pivot).max.z));
      // A shadow cast by a light that stays put turns about a point half its reach from the axis, towards where it falls.
      const reach = [(-lx / Math.max(lz, 0.05)) * topZ, (ly / Math.max(lz, 0.05)) * topZ];
      shadowPivot = [axis[0] + reach[0] / 2, axis[1] + reach[1] / 2];
      const atAngle = Object.fromEntries(turning.map((entry) => [entry.object.name, {}]));
      let bare = null;
      for (const angle of TURN_ANGLES) {
        for (const entry of turning) entry.pivot.rotation.z = (-angle * Math.PI) / 180;
        const darkness = await shadowOf(turning, still, bare);
        bare = lastBare;
        turnShadows[angle] = angle ? turnImage(new Float32Array(n * 3), darkness, w, h, -angle, shadowPivot).alpha : darkness;
        for (const entry of turning) {
          const passes = await passesOf(entry);
          if (!angle) { atAngle[entry.object.name][0] = passes; continue; }
          const back = (values, k = 3, factor = 1) => turnImage(Float32Array.from(values, (v) => v / factor), passes.alpha, w, h, -angle, axis, k);
          const colour = back(passes.colour);
          // Light can be many times white: turned at a 256th, and back.
          const light = back(passes.light, 3, 256);
          const gloss = back(passes.gloss, 3, 256);
          atAngle[entry.object.name][angle] = {
            alpha: colour.alpha, colour: colour.colour,
            light: light.colour.map((v) => v * 256), gloss: gloss.colour.map((v) => v * 256), glow: null,
          };
        }
      }
      for (const entry of turning) entry.pivot.rotation.z = 0;
      for (const entry of turning) {
        const frames = atAngle[entry.object.name];
        objects.push({
          name: layerNameOf(entry.object), motion: 'turns',
          metal: (entry.object.material.metalness ?? FINISH_MATERIAL[entry.object.material.finish].metalness * 100) > 50,
          passes: frames[0], at: Object.fromEntries(Object.entries(frames).filter(([angle]) => Number(angle) !== 0)),
        });
      }
    }

    const built = buildSceneLayers({ width: w, height: h, objects, shadow, turnShadows, axis, shadowPivot });
    target.dispose();
    pmrem.dispose();
    return { width: w, height: h, ...built, milliseconds: Date.now() - started };
  } finally {
    renderer.dispose();
  }
}
