import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildWorld, terrainHeight } from "./world";
import { overview, views, type PoemView } from "./views";

const app = document.querySelector<HTMLElement>("#app")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const error = document.querySelector<HTMLElement>("#error")!;
document
  .querySelector("#retry")!
  .addEventListener("click", () => location.reload());
const nav = document.querySelector<HTMLElement>(".poem-nav")!;
views.forEach((view, i) => {
  const button = document.createElement("button");
  button.className = "poem-button";
  button.dataset.view = view.id;
  button.setAttribute("aria-pressed", String(i === 0));
  button.title = `${view.text}（${i + 1}）`;
  button.innerHTML = `<span class="index">0${i + 1} / ${["MOUNTAINS", "SNOW PATHS", "LONE BOAT", "WINTER FISHING"][i]}</span><span class="verse">${view.text}</span><span class="location">${view.place}</span>`;
  nav.append(button);
});

function start() {
  const container = document.querySelector<HTMLElement>("#world")!;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    43,
    innerWidth / innerHeight,
    0.15,
    2200,
  );
  camera.position.set(...views[0].camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...views[0].target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 9;
  controls.maxDistance = 570;
  controls.update();
  const world = buildWorld(scene);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let selected = views[0],
    hidden = false,
    frame = 0,
    time = 0,
    last = performance.now();
  const samples: number[] = [];
  type Flight = {
    start: number;
    duration: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    altitude: number;
    short: boolean;
  };
  let flight: Flight | null = null;
  const state = {
    ready: false,
    selected: selected.id,
    flying: false,
    frames: 0,
    averageFps: 0,
    drawCalls: 0,
    triangles: 0,
    quality: "high",
    sceneId: scene.uuid,
    camera: [] as number[],
    target: [] as number[],
  };
  // Diagnostic state for browser acceptance; navigation uses the visible UI.
  Object.defineProperty(window, "__riverSnow", {
    value: state,
    writable: false,
  });
  const ease = (t: number) => t * t * (3 - 2 * t);
  function configureDistance(view: PoemView) {
    const distance = new THREE.Vector3(...view.camera).distanceTo(
      new THREE.Vector3(...view.target),
    );
    controls.minDistance =
      view.id === "fishing" ? 9 : Math.max(12, distance * 0.35);
    controls.maxDistance =
      view.id === "fishing" ? 68 : Math.min(570, distance * 1.6);
  }
  function select(view: PoemView, immediate = false) {
    const old = selected;
    selected = view;
    state.selected = view.id;
    app.classList.toggle("overview-mode", view.id === "overview");
    document.querySelector("#chapter-number")!.textContent = view.number;
    document.querySelector("#chapter-title")!.textContent = view.text;
    document.querySelector("#chapter-caption")!.textContent = view.caption;
    nav
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.view === view.id)),
      );
    document
      .querySelector("#overview")!
      .setAttribute("aria-pressed", String(view.id === "overview"));
    const to = new THREE.Vector3(...view.camera),
      toTarget = new THREE.Vector3(...view.target);
    if (immediate || motion.matches) {
      flight = null;
      camera.position.copy(to);
      controls.target.copy(toTarget);
      configureDistance(view);
      controls.update();
      state.camera = camera.position.toArray();
      state.target = controls.target.toArray();
      state.flying = false;
      return;
    }
    const short =
      camera.position.distanceTo(to) < 110 &&
      ((old.id === "boat" && view.id === "fishing") ||
        (old.id === "fishing" && view.id === "boat"));
    let altitude = Math.max(camera.position.y, to.y, 75);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      altitude = Math.max(
        altitude,
        terrainHeight(
          THREE.MathUtils.lerp(camera.position.x, to.x, t),
          THREE.MathUtils.lerp(camera.position.z, to.z, t),
        ) + 22,
      );
    }
    flight = {
      start: performance.now(),
      duration: short ? 3200 : 4200,
      from: camera.position.clone(),
      to,
      fromTarget: controls.target.clone(),
      toTarget,
      altitude,
      short,
    };
    controls.minDistance = 1;
    controls.maxDistance = 1200;
    state.flying = true;
  }
  nav.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-view]",
    );
    if (button) select(views.find((v) => v.id === button.dataset.view)!);
  });
  document
    .querySelector("#overview")!
    .addEventListener("click", () => select(overview));
  document
    .querySelector("#reset")!
    .addEventListener("click", () => select(selected));
  function toggleUI() {
    hidden = !hidden;
    app.classList.toggle("ui-hidden", hidden);
    document
      .querySelector("#hide")!
      .setAttribute("aria-pressed", String(hidden));
    if (hidden) (document.activeElement as HTMLElement)?.blur();
  }
  document.querySelector("#hide")!.addEventListener("click", toggleUI);
  document.querySelector("#restore")!.addEventListener("click", toggleUI);
  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      select(views[Number(e.key) - 1]);
    } else if (e.key === "0") {
      e.preventDefault();
      select(overview);
    } else if (e.key.toLowerCase() === "h") {
      e.preventDefault();
      toggleUI();
    }
  });
  function interrupt() {
    if (flight) {
      flight = null;
      state.flying = false;
      configureDistance(selected);
      const distance = camera.position.distanceTo(controls.target);
      controls.maxDistance = Math.max(controls.maxDistance, distance * 1.2);
      controls.minDistance = Math.min(controls.minDistance, distance * 0.75);
    }
  }
  renderer.domElement.addEventListener("pointerdown", interrupt);
  renderer.domElement.addEventListener("wheel", interrupt, { passive: true });
  controls.addEventListener("start", interrupt);
  motion.addEventListener("change", () => {
    if (motion.matches && flight) select(selected, true);
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  addEventListener("visibilitychange", () => {
    last = performance.now();
    samples.length = 0;
  });
  function animate(now: number) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(elapsed, 0.05);
    last = now;
    if (!document.hidden) time += dt;
    if (flight) {
      const f = flight,
        t = Math.min(1, (now - f.start) / f.duration),
        s = ease(t);
      if (f.short) camera.position.lerpVectors(f.from, f.to, s);
      else if (t < 0.2) {
        camera.position.copy(f.from);
        camera.position.y = THREE.MathUtils.lerp(
          f.from.y,
          f.altitude,
          ease(t / 0.2),
        );
      } else if (t < 0.8) {
        camera.position.lerpVectors(f.from, f.to, ease((t - 0.2) / 0.6));
        camera.position.y = f.altitude;
      } else {
        camera.position.copy(f.to);
        camera.position.y = THREE.MathUtils.lerp(
          f.altitude,
          f.to.y,
          ease((t - 0.8) / 0.2),
        );
      }
      controls.target.lerpVectors(f.fromTarget, f.toTarget, s);
      if (t === 1) {
        camera.position.copy(f.to);
        controls.target.copy(f.toTarget);
        flight = null;
        state.flying = false;
        configureDistance(selected);
      }
    }
    controls.update();
    // Maintain clearance from the stepped terrain and the river during free observation.
    let floor = 1.5;
    for (const dx of [-2, 0, 2])
      for (const dz of [-2, 0, 2])
        floor = Math.max(
          floor,
          terrainHeight(camera.position.x + dx, camera.position.z + dz) + 3,
        );
    if (camera.position.y < floor) camera.position.y = floor;
    world.update(time, motion.matches, renderer.getPixelRatio());
    renderer.render(scene, camera);
    frame++;
    state.frames = frame;
    state.camera = camera.position.toArray();
    state.target = controls.target.toArray();
    state.drawCalls = renderer.info.render.calls;
    state.triangles = renderer.info.render.triangles;
    if (frame > 45 && !document.hidden) {
      samples.push(elapsed);
      if (samples.length > 180) samples.shift();
    }
    if (frame % 60 === 0 && samples.length) {
      state.averageFps = Math.round(
        samples.length / samples.reduce((a, b) => a + b, 0),
      );
      if (frame > 240 && state.averageFps < 32 && state.quality === "high") {
        state.quality = "balanced";
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
      }
    }
    if (frame === 2) {
      state.ready = true;
      loading.classList.add("loaded");
      setTimeout(() => (loading.hidden = true), 900);
    }
    requestAnimationFrame(animate);
  }
  configureDistance(views[0]);
  requestAnimationFrame(animate);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    error.hidden = false;
  });
}
try {
  start();
} catch (cause) {
  console.error("Unable to initialize the snow valley", cause);
  loading.hidden = true;
  error.hidden = false;
}
