/**
 * On-device pose model (MediaPipe Pose Landmarker "lite", Apache-2.0).
 *
 * The runtime and model ship with the app as hashed assets, so nothing is
 * fetched from a third party and the service worker can cache them. Frames go
 * from the <video> straight into WebAssembly; no image ever leaves the device.
 * Only imported by the lazy Form check screen, so none of this is in the main bundle.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import simdLoader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdBinary from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import plainLoader from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import plainBinary from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import modelUrl from '../assets/pose/pose_landmarker_lite.task?url';

// The library posts usage statistics to this Google endpoint every minute. The
// app promises that nothing leaves the phone, so those requests are refused
// before they are sent; the library then stops trying.
const TELEMETRY = 'https://odml.pa.googleapis.com/';
function blockTelemetry() {
  if (globalThis.fetch.__hpGuard) return;
  const real = globalThis.fetch.bind(globalThis);
  const guarded = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    return url.startsWith(TELEMETRY) ? Promise.reject(new TypeError('Blocked by HealthPilot')) : real(input, init);
  };
  guarded.__hpGuard = true;
  globalThis.fetch = guarded;
}

let pending = null;

/** Loads the model once per page; later calls reuse it. */
export function loadPoseModel() {
  if (pending) return pending;
  blockTelemetry();
  pending = (async () => {
    const simd = await FilesetResolver.isSimdSupported();
    const files = simd ? { wasmLoaderPath: simdLoader, wasmBinaryPath: simdBinary } : { wasmLoaderPath: plainLoader, wasmBinaryPath: plainBinary };
    const make = (delegate) => PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try { return await make('GPU'); } catch { return make('CPU'); }
  })();
  pending.catch(() => { pending = null; });
  return pending;
}
