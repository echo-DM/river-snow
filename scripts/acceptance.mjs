import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Exercise the production page through real Chromium input, using agent-browser.
const url = process.argv[2] || "http://127.0.0.1:4173";
const session = "river-snow-acceptance";
const root = path.resolve(import.meta.dirname, "..");
const screenshots = path.join(root, "docs/screenshots");
fs.mkdirSync(screenshots, { recursive: true });
const checks = [];
function browser(...args) {
  const result = spawnSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
    timeout: 45000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${args.join(" ")}: ${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function evaluate(source) {
  const result = spawnSync(
    "agent-browser",
    ["--session", session, "eval", "--stdin"],
    { input: `JSON.stringify(${source})`, encoding: "utf8", timeout: 15000 },
  );
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return JSON.parse(JSON.parse(result.stdout.trim()));
}
const state = () => evaluate("window.__riverSnow");
const wait = (source) => browser("wait", "--fn", source);
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
const near = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 0.1);
const settled = (id) =>
  wait(
    `window.__riverSnow?.selected === '${id}' && !window.__riverSnow.flying`,
  );
const shots = [
  ["mountains", [200, 142, 215], "01-mountains.png"],
  ["paths", [-80, 42, 96], "02-paths.png"],
  ["boat", [81, 36, 98], "03-boat.png"],
  ["fishing", [39, 9.5, 52], "04-fishing.png"],
];
let browserOpened = false;
try {
  browser("open", url);
  browserOpened = true;
  browser("set", "viewport", "1440", "900");
  wait("window.__riverSnow?.ready === true");
  check(
    "Initial console has no rendering errors or uncaught exceptions",
    !browser("console").trim() && !browser("errors").trim(),
  );
  browser("console", "--clear");
  browser("errors", "--clear");
  const first = state();
  const environment = evaluate(
    `(() => { const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],pixelRatio:devicePixelRatio}; })()`,
  );
  check(
    "WebGL scene reaches ready state",
    first.ready && first.triangles > 10000,
  );
  const rendering = [];
  for (const [id, camera, filename] of shots) {
    browser("click", `[data-view="${id}"]`);
    settled(id);
    const current = state();
    check(
      `${id}: arrives at authored camera in the original shared scene`,
      near(current.camera, camera) && current.sceneId === first.sceneId,
    );
    check(
      `${id}: one selected poem button`,
      evaluate(
        `document.querySelectorAll('.poem-button[aria-pressed="true"]').length === 1 && document.querySelector('[data-view="${id}"]').getAttribute('aria-pressed') === 'true'`,
      ),
    );
    browser("screenshot", path.join(screenshots, filename));
    rendering.push({
      view: id,
      fps: current.averageFps,
      drawCalls: current.drawCalls,
      triangles: current.triangles,
      quality: current.quality,
    });
  }
  browser("click", "#overview");
  settled("overview");
  check(
    "Overview preserves the original world",
    state().sceneId === first.sceneId,
  );
  browser("screenshot", path.join(screenshots, "05-overview.png"));

  browser("click", '[data-view="mountains"]');
  browser("click", '[data-view="paths"]');
  browser("click", '[data-view="fishing"]');
  settled("fishing");
  check(
    "Rapid selection arrives at the final requested view",
    near(state().camera, shots[3][1]),
  );

  browser("click", '[data-view="mountains"]');
  wait("window.__riverSnow.flying");
  browser("mouse", "move", "750", "460");
  browser("mouse", "down");
  browser("mouse", "up");
  check("Pointer input interrupts camera flight", !state().flying);
  browser("click", '[data-view="fishing"]');
  settled("fishing");
  const beforeDrag = state().camera;
  browser("mouse", "move", "750", "460");
  browser("mouse", "down");
  browser("mouse", "move", "890", "480");
  browser("mouse", "up");
  const frame = state().frames;
  wait(`window.__riverSnow.frames > ${frame + 20}`);
  check("Dragging rotates the camera", !near(state().camera, beforeDrag));
  const distance = () => {
    const s = state();
    return Math.hypot(...s.camera.map((v, i) => v - s.target[i]));
  };
  const beforeWheel = distance();
  browser("mouse", "wheel", "300");
  const frameAfterWheel = state().frames;
  wait(`window.__riverSnow.frames > ${frameAfterWheel + 20}`);
  check(
    "Wheel input changes viewing distance",
    Math.abs(distance() - beforeWheel) > 0.5,
  );
  browser("click", "#reset");
  settled("fishing");
  check(
    "Reset restores the authored framing",
    near(state().camera, shots[3][1]),
  );

  browser("click", "#hide");
  check(
    "Hide removes the interface and offers restore",
    evaluate(
      `document.querySelector('#app').classList.contains('ui-hidden') && getComputedStyle(document.querySelector('#restore')).display !== 'none' && getComputedStyle(document.querySelector('.poem-nav')).visibility === 'hidden'`,
    ),
  );
  browser("screenshot", path.join(screenshots, "06-fishing-clean.png"));
  browser("click", "#restore");
  check(
    "Restore brings the poem interface back",
    evaluate(`!document.querySelector('#app').classList.contains('ui-hidden')`),
  );
  browser("press", "h");
  browser("press", "h");
  check(
    "H toggles the interface in both directions",
    evaluate(`!document.querySelector('#app').classList.contains('ui-hidden')`),
  );
  for (const [index, [id]] of shots.entries()) {
    browser("press", String(index + 1));
    settled(id);
    check(`Keyboard ${index + 1} selects ${id}`, state().selected === id);
  }
  browser("press", "0");
  settled("overview");
  check(
    "Keyboard 0 selects the full-world overview",
    state().selected === "overview",
  );

  browser("set", "media", "light", "reduced-motion");
  check(
    "Reduced-motion emulation is active",
    evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),
  );
  browser("click", '[data-view="mountains"]');
  check(
    "Reduced motion arrives directly without a camera flight",
    !state().flying && near(state().camera, shots[0][1]),
  );
  browser("set", "media", "light");
  check(
    "Normal motion can be restored",
    !evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),
  );

  browser("set", "viewport", "1920", "1080");
  check(
    "1920×1080 canvas and all navigation buttons fit the viewport",
    evaluate(
      `document.querySelector('canvas').clientWidth === innerWidth && [...document.querySelectorAll('button:not(#restore):not(#retry)')].every(b => {const r=b.getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})`,
    ),
  );
  browser("screenshot", path.join(screenshots, "07-desktop-1920.png"));
  browser("click", '[data-view="fishing"]');
  settled("fishing");
  const sampleStart = state().frames;
  wait(`window.__riverSnow.frames > ${sampleStart + 180}`);
  rendering.push({ view: "fishing-1920", ...state() });
  browser("set", "viewport", "1024", "740");
  check(
    "1024×740 desktop controls remain visible",
    evaluate(
      `[...document.querySelectorAll('.poem-button,.tools button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})`,
    ),
  );

  // Use the real WebGL context-loss extension, then reload to recover a fresh scene.
  check(
    "All navigation and rendering checks leave a clean console",
    !browser("console").trim() && !browser("errors").trim(),
  );
  evaluate(
    `(() => {document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();return true;})()`,
  );
  wait(`!document.querySelector('#error').hidden`);
  check(
    "Context loss displays a readable recovery message",
    evaluate(
      `!document.querySelector('#error').hidden && document.querySelector('#retry').textContent === '重新加载'`,
    ),
  );
  browser("click", "#retry");
  wait("window.__riverSnow?.ready");
  check(
    "Reload recovers the 3D world after context loss",
    state().ready && evaluate(`document.querySelector('#error').hidden`),
  );
  browser("set", "viewport", "1440", "900");
  browser("console", "--clear");
  browser("errors", "--clear");
  check(
    "Runtime resources are served locally without external CDN requests",
    evaluate(
      `performance.getEntriesByType('resource').every(entry => entry.name.startsWith(location.origin + '/') || entry.name.startsWith('data:'))`,
    ),
  );
  browser("click", '[data-view="fishing"]');
  settled("fishing");
  const consoleOutput = browser("console"),
    errors = browser("errors");
  check(
    "Final console has no errors and no uncaught exceptions",
    !consoleOutput.trim() && !errors.trim(),
  );
  const report = {
    date: new Date().toISOString(),
    url,
    environment,
    checks,
    rendering,
    console: consoleOutput,
    errors,
    screenshotFiles: fs.readdirSync(screenshots),
    boundaries: [
      "Chromium desktop only; Safari, Firefox, and real devices not tested.",
      "Performance is measured in this environment and is not a guarantee on other hardware.",
      "Context-loss recovery tested; initial WebGL-disabled startup not emulated.",
    ],
  };
  fs.mkdirSync(path.join(root, "docs/qa"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/qa/results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `\n${checks.length} checks passed. Evidence: docs/qa/results.json`,
  );
} finally {
  if (browserOpened) {
    try {
      browser("set", "offline", "off");
      browser("close");
    } catch {
      /* Preserve the original failure. */
    }
  }
}
