import * as THREE from "three";

const CELL = 3;
const NX = 192,
  NZ = 176;
const X0 = (-NX * CELL) / 2,
  Z0 = (-NZ * CELL) / 2;
const hash = (x: number, z: number) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + 91.7) * 43758.5453;
  return v - Math.floor(v);
};
const smooth = (x: number) => x * x * (3 - 2 * x);
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), fx),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx),
    fz,
  );
}
export const riverX = (z: number) =>
  Math.sin((z + 80) * 0.014) * 30 + Math.sin(z * 0.032) * 8;
const riverWidth = (z: number) => 31 + Math.sin(z * 0.018) * 6;
const gaussian = (
  x: number,
  z: number,
  px: number,
  pz: number,
  sx: number,
  sz: number,
  h: number,
) => h * Math.exp(-(((x - px) / sx) ** 2 + ((z - pz) / sz) ** 2));
function rawHeight(x: number, z: number) {
  const distance = Math.abs(x - riverX(z));
  const width = riverWidth(z);
  if (distance < width) return -4;
  const bank = Math.min(1, (distance - width) / 26);
  let h = 3 + 4 * noise(x * 0.022, z * 0.022);
  h +=
    gaussian(x, z, -155, -105, 73, 59, 119) +
    gaussian(x, z, -210, 44, 68, 63, 91);
  h +=
    gaussian(x, z, -118, -215, 55, 55, 150) +
    gaussian(x, z, 147, -153, 61, 62, 140);
  h +=
    gaussian(x, z, 228, -38, 74, 74, 105) +
    gaussian(x, z, 157, 129, 75, 55, 69);
  h +=
    gaussian(x, z, -196, 180, 70, 65, 44) +
    gaussian(x, z, 13, -250, 75, 46, 123);
  h +=
    gaussian(x, z, -237, -214, 34, 36, 78) +
    gaussian(x, z, 229, -239, 37, 39, 88);
  h +=
    gaussian(x, z, -65, -244, 27, 30, 66) +
    gaussian(x, z, 84, -240, 33, 32, 92);
  h *= 0.84 + noise(x * 0.027, z * 0.025) * 0.32;
  const jagged =
    (noise(x * 0.058, z * 0.058) - 0.45) * 14 +
    (noise(x * 0.13, z * 0.13) - 0.5) * 5;
  h = h * bank + jagged * Math.min(1, h / 30) * bank;
  return Math.max(3, Math.floor(h / CELL) * CELL);
}
const heights = new Float32Array(NX * NZ);
for (let z = 0; z < NZ; z++)
  for (let x = 0; x < NX; x++)
    heights[z * NX + x] = rawHeight(
      X0 + x * CELL + CELL / 2,
      Z0 + z * CELL + CELL / 2,
    );
export function terrainHeight(x: number, z: number) {
  const ix = Math.floor((x - X0) / CELL),
    iz = Math.floor((z - Z0) / CELL);
  return ix >= 0 && ix < NX && iz >= 0 && iz < NZ ? heights[iz * NX + ix] : -3;
}
const trailX = (z: number) =>
  riverX(z) - riverWidth(z) - 18 - Math.sin(z * 0.037) * 6;
function pathDistance(x: number, z: number) {
  const main = Math.abs(x - trailX(z));
  const branchA =
    z > -24 && z < 100
      ? Math.abs(x - (trailX(z) - Math.max(0, 70 - z) * 0.54))
      : 999;
  const branchB =
    z > -75 && z < 48
      ? Math.abs(x - (trailX(z) - Math.max(0, 25 - z) * 0.37))
      : 999;
  return Math.min(main, branchA, branchB);
}

function pixelTexture(base: string, contrast: number, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const color = new THREE.Color(base);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const c = color
        .clone()
        .multiplyScalar(1 + (hash(x + seed, y) - 0.5) * contrast);
      ctx.fillStyle = "#" + c.getHexString();
      ctx.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
type MeshData = { p: number[]; n: number[]; uv: number[]; c: number[] };
const data = (): MeshData => ({ p: [], n: [], uv: [], c: [] });
function quad(
  d: MeshData,
  a: number[],
  b: number[],
  c: number[],
  e: number[],
  normal: number[],
  color: THREE.Color,
  u = 1,
  v = 1,
) {
  const verts = [a, b, c, a, c, e],
    uvs = [
      [0, 0],
      [u, 0],
      [u, v],
      [0, 0],
      [u, v],
      [0, v],
    ];
  for (let i = 0; i < 6; i++) {
    d.p.push(...verts[i]);
    d.n.push(...normal);
    d.uv.push(...uvs[i]);
    d.c.push(color.r, color.g, color.b);
  }
}
function createMesh(d: MeshData, material: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(d.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(d.n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(d.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(d.c, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}
function createTerrain(scene: THREE.Scene) {
  const snow = new THREE.MeshLambertMaterial({
    map: pixelTexture("#f3f6f4", 0.09, 11),
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const rock = new THREE.MeshLambertMaterial({
    map: pixelTexture("#6d8290", 0.2, 43),
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const color = new THREE.Color();
  for (let cz = 0; cz < NZ; cz += 24)
    for (let cx = 0; cx < NX; cx += 24) {
      const tops = data(),
        sides = data();
      for (let iz = cz; iz < Math.min(cz + 24, NZ); iz++)
        for (let ix = cx; ix < Math.min(cx + 24, NX); ix++) {
          const x = X0 + ix * CELL,
            z = Z0 + iz * CELL,
            h = heights[iz * NX + ix];
          if (h < 0) continue;
          const onPath = pathDistance(x + 1.5, z + 1.5) < 4.4 && h < 36;
          color.set(onPath ? "#829aa9" : "#e5eef0");
          color.multiplyScalar(0.94 + hash(ix, iz) * 0.1);
          quad(
            tops,
            [x, h, z],
            [x, h, z + CELL],
            [x + CELL, h, z + CELL],
            [x + CELL, h, z],
            [0, 1, 0],
            color,
          );
          const neighbors = [
            terrainHeight(x - 1, z + 1),
            terrainHeight(x + CELL + 1, z + 1),
            terrainHeight(x + 1, z - 1),
            terrainHeight(x + 1, z + CELL + 1),
          ];
          const corners = [
            [
              [x, h, z],
              [x, h, z + CELL],
            ],
            [
              [x + CELL, h, z + CELL],
              [x + CELL, h, z],
            ],
            [
              [x + CELL, h, z],
              [x, h, z],
            ],
            [
              [x, h, z + CELL],
              [x + CELL, h, z + CELL],
            ],
          ];
          const normals = [
            [-1, 0, 0],
            [1, 0, 0],
            [0, 0, -1],
            [0, 0, 1],
          ];
          for (let s = 0; s < 4; s++) {
            const nh = Math.max(-3, neighbors[s]);
            if (nh >= h) continue;
            const [a, b] = corners[s];
            const snowBottom = Math.max(nh, h - 0.65);
            color.set("#d6e4e9");
            quad(
              tops,
              a,
              b,
              [b[0], snowBottom, b[2]],
              [a[0], snowBottom, a[2]],
              normals[s],
              color,
              1,
              0.25,
            );
            if (nh < snowBottom) {
              color.set(h > 66 ? "#c0ced4" : "#9cafbc");
              color.multiplyScalar(0.87 + hash(ix + 17, iz) * 0.2);
              quad(
                sides,
                [a[0], snowBottom, a[2]],
                [b[0], snowBottom, b[2]],
                [b[0], nh, b[2]],
                [a[0], nh, a[2]],
                normals[s],
                color,
                1,
                (snowBottom - nh) / CELL,
              );
            }
          }
        }
      if (tops.p.length) scene.add(createMesh(tops, snow));
      if (sides.p.length) scene.add(createMesh(sides, rock));
    }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: "#ccdbe2" }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -4;
  scene.add(ground);
}
interface Block {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  rotation?: number;
}
function instanceBlocks(
  blocks: Block[],
  material: THREE.Material,
  scene: THREE.Object3D,
  cast = false,
) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
    blocks.length,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  blocks.forEach((b, i) => {
    dummy.position.set(...b.p);
    dummy.scale.set(...b.s);
    dummy.rotation.set(0, b.rotation ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(b.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
function createVegetation(scene: THREE.Scene) {
  const timber: Block[] = [],
    snow: Block[] = [],
    stones: Block[] = [];
  for (let i = 0; i < 220; i++) {
    const x = (hash(i, 71) - 0.5) * 470,
      z = (hash(i, 109) - 0.5) * 450;
    const y = terrainHeight(x, z),
      dist = Math.abs(x - riverX(z));
    if (y < 3 || y > 67 || dist < riverWidth(z) + 9 || pathDistance(x, z) < 5)
      continue;
    const trunk = 5 + hash(i, 2) * 8,
      w = 0.6 + hash(i, 5) * 0.65;
    timber.push({
      p: [x, y + trunk / 2, z],
      s: [w, trunk, w],
      color: "#596571",
    });
    const branches = 3 + Math.floor(hash(i, 45) * 4);
    for (let j = 0; j < branches; j++) {
      const angle = j * 2.4 + hash(i, 7) * Math.PI * 2,
        len = 2 + hash(i, j + 10) * 4,
        yy = y + trunk * (0.4 + j * 0.09);
      const steps = Math.ceil(len / 0.8);
      for (let k = 0; k < steps; k++) {
        const xx = x + Math.cos(angle) * (k + 1) * 0.75,
          zz = z + Math.sin(angle) * (k + 1) * 0.75;
        timber.push({
          p: [xx, yy + k * 0.52, zz],
          s: [0.72, 0.73, 0.72],
          color: "#63717c",
        });
        if (k % 2 === 0)
          snow.push({
            p: [xx, yy + k * 0.52 + 0.42, zz],
            s: [0.8, 0.12, 0.8],
            color: "#ebf1f1",
          });
      }
    }
    snow.push({
      p: [x, y + trunk + 0.18, z],
      s: [w + 0.3, 0.35, w + 0.3],
      color: "#eaf0ee",
    });
  }
  // Sparse, snow-clad firs break up the valley's silhouette.
  for (let i = 0; i < 75; i++) {
    const x = (hash(i, 157) - 0.5) * 480,
      z = (hash(i, 170) - 0.5) * 445,
      y = terrainHeight(x, z);
    if (y < 9 || y > 79 || pathDistance(x, z) < 7) continue;
    const h = 7 + hash(i, 173) * 8;
    timber.push({
      p: [x, y + h * 0.45, z],
      s: [1, h * 0.9, 1],
      color: "#485d68",
    });
    for (let j = 0; j < 4; j++) {
      const w = (4 - j) * 1.55;
      timber.push({
        p: [x, y + 3 + j * 2.1, z],
        s: [w, 1.65, w],
        color: "#526a76",
      });
      snow.push({
        p: [x, y + 3.93 + j * 2.1, z],
        s: [w + 0.2, 0.38, w + 0.2],
        color: "#dfeaec",
      });
    }
  }
  for (let i = 0; i < 450; i++) {
    const x = (hash(i, 223) - 0.5) * 510,
      z = (hash(i, 245) - 0.5) * 480,
      y = terrainHeight(x, z);
    if (y < 0 || y > 96 || pathDistance(x, z) < 3.4) continue;
    const w = 0.8 + hash(i, 251) * 3;
    stones.push({
      p: [x, y + w * 0.3, z],
      s: [w, w * 0.65, w * 0.8],
      color: "#8295a0",
    });
    snow.push({
      p: [x, y + w * 0.65 + 0.12, z],
      s: [w + 0.12, 0.25, w * 0.8 + 0.1],
      color: "#e8eff0",
    });
  }
  instanceBlocks(
    timber,
    new THREE.MeshLambertMaterial({ map: pixelTexture("#ffffff", 0.17, 4) }),
    scene,
    true,
  );
  instanceBlocks(snow, new THREE.MeshLambertMaterial(), scene);
  instanceBlocks(stones, new THREE.MeshLambertMaterial(), scene, true);
}
function createRiver(scene: THREE.Scene) {
  const d = data(),
    color = new THREE.Color("#ffffff");
  for (let z = Z0; z < Z0 + NZ * CELL; z += CELL) {
    const a = Math.round((riverX(z) - riverWidth(z) - 3) / CELL) * CELL,
      b = Math.round((riverX(z) + riverWidth(z) + 3) / CELL) * CELL;
    const c =
        Math.round((riverX(z + CELL) - riverWidth(z + CELL) - 3) / CELL) * CELL,
      e =
        Math.round((riverX(z + CELL) + riverWidth(z + CELL) + 3) / CELL) * CELL;
    quad(
      d,
      [a, 0.3, z],
      [c, 0.3, z + CELL],
      [e, 0.3, z + CELL],
      [b, 0.3, z],
      [0, 1, 0],
      color,
    );
  }
  const water = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      fogColor: { value: new THREE.Color("#b9ccd6") },
    },
    vertexShader: `varying vec3 vWorld; void main(){vec4 wp=modelMatrix*vec4(position,1.);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `uniform float time; uniform vec3 fogColor; varying vec3 vWorld; void main(){vec2 p=floor(vWorld.xz*1.8)/1.8; float wave=sin(p.x*.13+p.y*.28+time*.25)*sin(p.y*.31-time*.19);float grain=fract(sin(dot(floor(p*.5),vec2(12.98,78.23)))*43758.54);vec3 col=mix(vec3(.028,.07,.093),vec3(.08,.145,.18),wave*.2+.45+grain*.15);float sheen=pow(max(0.,sin(p.y*.095+p.x*.025+time*.07)),12.);col+=vec3(.022,.035,.038)*sheen; float f=1.-exp(-pow(length(cameraPosition-vWorld)*.0024,2.));gl_FragColor=vec4(mix(col,fogColor,f),1.);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}`,
  });
  scene.add(createMesh(d, water));
  const ice: Block[] = [];
  for (let i = 0; i < 210; i++) {
    const z = Z0 + hash(i, 367) * NZ * CELL;
    const side = i % 2 ? 1 : -1;
    const x = riverX(z) + side * (riverWidth(z) - hash(i, 397) * 5);
    const size = 2 + hash(i, 387) * 5;
    ice.push({
      p: [Math.round(x / 3) * 3, 0.56, Math.round(z / 3) * 3],
      s: [size, 0.45, size * 0.7],
      color: i % 3 ? "#b5cbd3" : "#dbe6e8",
    });
  }
  instanceBlocks(ice, new THREE.MeshLambertMaterial(), scene);
  return water;
}
function createBoat(scene: THREE.Scene) {
  const boat = new THREE.Group();
  boat.position.set(26, 0.3, 36);
  boat.rotation.y = -0.24;
  scene.add(boat);
  const blocks: Block[] = [];
  const add = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => blocks.push({ p: [x, y, z], s: [w, h, d], color });
  // Tapered wooden hull, planks and snow on the gunwales.
  for (let z = -4.4; z <= 4.4; z += 0.8) {
    const w = 3.1 - Math.max(0, Math.abs(z) - 2.2) * 0.65;
    add(0, 0.23, z, w, 0.46, 0.83, "#625c53");
    add(-w / 2, 0.78, z, 0.3, 0.72, 0.85, "#7d7462");
    add(w / 2, 0.78, z, 0.3, 0.72, 0.85, "#7d7462");
    add(-w / 2, 1.18, z, 0.37, 0.12, 0.84, "#dee5e1");
    add(w / 2, 1.18, z, 0.37, 0.12, 0.84, "#dee5e1");
    add(0, 0.5, z, w - 0.35, 0.13, 0.1, "#94866c");
  }
  add(0, 0.95, -2.1, 2.9, 0.3, 0.7, "#80735e");
  add(0, 0.95, 2.15, 2.9, 0.3, 0.7, "#80735e");
  // One seated angler, with a straw cape and a stepped bamboo hat.
  add(-0.15, 1.2, -0.5, 1.35, 0.38, 1.1, "#4c514e");
  add(-0.58, 1.15, 0.3, 0.42, 0.42, 1.2, "#414b4a");
  add(0.45, 1.15, 0.3, 0.42, 0.42, 1.2, "#414b4a");
  add(-0.12, 2.02, -0.4, 1.25, 1.5, 0.9, "#7d7764");
  add(-0.12, 2.72, -0.36, 1.07, 0.28, 0.94, "#8d856b");
  for (let i = 0; i < 9; i++) {
    const xx = -0.9 + i * 0.19;
    add(
      xx,
      1.87,
      -0.92,
      0.13,
      1.6 - (i % 3) * 0.1,
      0.3,
      i % 2 ? "#827b62" : "#6e6b56",
    );
  }
  for (let i = 0; i < 6; i++) {
    const z = -0.78 + i * 0.18;
    add(-0.77, 1.96, z, 0.13, 1.62, 0.15, i % 2 ? "#8f8568" : "#6f6c56");
    add(0.57, 1.96, z, 0.13, 1.62, 0.15, i % 2 ? "#8f8568" : "#6f6c56");
  }
  add(-0.12, 3.22, -0.32, 0.74, 0.75, 0.74, "#b7a68a");
  add(-0.12, 3.49, -0.38, 0.85, 0.18, 0.78, "#737365");
  add(-0.12, 3.63, -0.32, 2.35, 0.16, 2.35, "#a89b77");
  add(-0.12, 3.79, -0.32, 1.85, 0.18, 1.85, "#b7a984");
  add(-0.12, 3.97, -0.32, 1.26, 0.2, 1.26, "#b5aa85");
  add(-0.12, 4.14, -0.32, 0.68, 0.18, 0.68, "#b7ad8d");
  add(-0.12, 4.26, -0.32, 0.75, 0.08, 0.75, "#e9ece1");
  add(-0.95, 2.36, -0.05, 0.45, 0.63, 0.56, "#817b65");
  add(0.69, 2.35, 0.2, 0.4, 0.43, 1.03, "#847c61");
  add(0.67, 2.32, 0.79, 0.32, 0.3, 0.37, "#baa88b");
  instanceBlocks(
    blocks,
    new THREE.MeshLambertMaterial({ map: pixelTexture("#ffffff", 0.12, 81) }),
    boat,
    true,
  );
  const rodStart = new THREE.Vector3(0.65, 2.38, 0.85),
    rodEnd = new THREE.Vector3(1.08, 4.03, 7.8);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.065, rodStart.distanceTo(rodEnd), 4),
    new THREE.MeshLambertMaterial({ color: "#675e48" }),
  );
  rod.position.copy(rodStart).add(rodEnd).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    rodEnd.clone().sub(rodStart).normalize(),
  );
  boat.add(rod);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      rodEnd,
      new THREE.Vector3(1.08, -0.43, 7.8),
    ]),
    new THREE.LineBasicMaterial({
      color: "#d3dedc",
      transparent: true,
      opacity: 0.85,
    }),
  );
  boat.add(line);
  const ripple = new THREE.Group();
  scene.add(ripple);
  const local = new THREE.Vector3(1.08, 0, 7.8)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y)
    .add(boat.position);
  ripple.position.set(local.x, 0.34, local.z);
  for (let i = 0; i < 3; i++) {
    const points = [];
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(a) * (1 + i * 0.7),
          0,
          Math.sin(a) * (1 + i * 0.7),
        ),
      );
    }
    ripple.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: "#acc8cd",
          transparent: true,
          opacity: 0.2 - i * 0.045,
        }),
      ),
    );
  }
  return { boat, ripple };
}
function createSnow(scene: THREE.Scene) {
  const count = 3200,
    p = new Float32Array(count * 3),
    random = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (hash(i, 531) - 0.5) * 620;
    p[i * 3 + 1] = hash(i, 559) * 210;
    p[i * 3 + 2] = (hash(i, 563) - 0.5) * 580;
    random[i] = hash(i, 570);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("random", new THREE.BufferAttribute(random, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `uniform float time; uniform float pixelRatio; attribute float random; varying float alpha; void main(){vec3 p=position;p.y=mod(p.y-time*(1.7+random*2.),210.);p.x+=sin(time*.22+random*60.)*3.;p.z+=time*.4; p.z=mod(p.z+290.,580.)-290.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(160./max(10.,-mv.z),1.,3.3)*pixelRatio;alpha=.3+random*.4;}`,
    fragmentShader: `varying float alpha;void main(){gl_FragColor=vec4(.9,.96,1.,alpha);}`,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  scene.add(points);
  return material;
}
export function buildWorld(scene: THREE.Scene) {
  scene.background = new THREE.Color("#b9ccd6");
  scene.fog = new THREE.FogExp2("#b9ccd6", 0.0024);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color("#b9ccd6") },
        zenith: { value: new THREE.Color("#7997ad") },
      },
      vertexShader: `varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 horizon;uniform vec3 zenith;varying vec3 p;void main(){float t=smoothstep(-.03,.6,normalize(p).y);gl_FragColor=vec4(mix(horizon,zenith,t),1.);\n #include <colorspace_fragment>\n}`,
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight("#e8f3ff", "#637383", 2.25));
  const sun = new THREE.DirectionalLight("#f4f1df", 2.1);
  sun.position.set(-100, 180, 85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.7;
  scene.add(sun);
  createTerrain(scene);
  createVegetation(scene);
  const water = createRiver(scene);
  const { boat, ripple } = createBoat(scene);
  const snow = createSnow(scene);
  return {
    update(time: number, reduced: boolean, pixelRatio: number) {
      water.uniforms.time.value = reduced ? 0 : time;
      snow.uniforms.time.value = reduced ? 0 : time;
      snow.uniforms.pixelRatio.value = pixelRatio;
      boat.position.y = 0.3 + (reduced ? 0 : Math.sin(time * 0.65) * 0.04);
      boat.rotation.z = reduced ? 0 : Math.sin(time * 0.45) * 0.009;
      ripple.scale.setScalar(reduced ? 1 : 1 + Math.sin(time * 0.8) * 0.08);
    },
  };
}
