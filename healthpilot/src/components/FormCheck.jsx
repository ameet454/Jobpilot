import { useEffect, useRef, useState } from 'react';
import { createTracker, formCheckInfo, jointLandmarks } from '../lib/formcheck.js';
import { loadPoseModel } from '../lib/poseEngine.js';
import '../formcheck.css';

// Skeleton drawn over the video (MediaPipe Pose indices).
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
const SAY_GAP = 3500; // ms between spoken corrections

function say(text) {
  const s = window.speechSynthesis;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = s.getVoices();
  const pick = v.find((x) => x.lang === 'en-IN') || v.find((x) => x.lang?.startsWith('en'));
  if (pick) u.voice = pick;
  u.rate = 1.05;
  s.speak(u);
}

function draw(canvas, video, lms, ring, bad) {
  const w = video.videoWidth; const h = video.videoHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!lms) return;
  const s = Math.max(2, Math.round(Math.min(w, h) / 160));
  const ok = (i) => (lms[i].visibility ?? 1) > 0.5;
  g.lineWidth = s * 1.5; g.lineCap = 'round';
  g.strokeStyle = bad ? 'rgba(255, 82, 82, 0.9)' : 'rgba(40, 220, 160, 0.9)';
  for (const [a, b] of BONES) {
    if (!ok(a) || !ok(b)) continue;
    g.beginPath(); g.moveTo(lms[a].x * w, lms[a].y * h); g.lineTo(lms[b].x * w, lms[b].y * h); g.stroke();
  }
  g.fillStyle = '#fff';
  for (let i = 11; i < 33; i++) if (ok(i)) { g.beginPath(); g.arc(lms[i].x * w, lms[i].y * h, s * 1.4, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#ffd23f'; g.lineWidth = s;
  for (const i of ring) if (ok(i)) { g.beginPath(); g.arc(lms[i].x * w, lms[i].y * h, s * 6, 0, Math.PI * 2); g.stroke(); }
}

/**
 * Full-screen camera coach. The pose model runs on the phone; frames are read
 * from the <video> element and never stored or sent anywhere.
 */
export default function FormCheck({ ex, onClose }) {
  const info = formCheckInfo(ex.id);
  const videoRef = useRef(null); const canvasRef = useRef(null); const fileRef = useRef(null);
  const [mode, setMode] = useState('intro'); // intro | loading | live | done
  const [source, setSource] = useState(null); // { kind: 'camera', facing } | { kind: 'file', url }
  const [error, setError] = useState(null);
  const [hud, setHud] = useState(null);
  const [voice, setVoice] = useState(true);
  const [summary, setSummary] = useState(null);
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const trackerRef = useRef(null);

  useEffect(() => {
    if (!source) return undefined;
    let stop = false; let stream = null; let handle = null;
    const video = videoRef.current;
    const tracker = createTracker(ex.id);
    trackerRef.current = tracker;
    setMode('loading'); setError(null); setHud(null);

    (async () => {
      try {
        const modelP = loadPoseModel();
        if (source.kind === 'camera') {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera. Try Chrome or Safari over https.');
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: source.facing, width: { ideal: 960 }, height: { ideal: 720 } } });
          if (stop) return;
          video.srcObject = stream;
        } else {
          video.srcObject = null;
          video.src = source.url;
          video.loop = false;
        }
        await video.play();
        const model = await modelP;
        if (stop) return;
        setMode('live');

        const said = { at: 0, rep: 0 };
        let lastTs = -1; let lastUi = 0;
        const step = () => {
          if (stop) return;
          if (video.readyState >= 2 && video.videoWidth) {
            const now = performance.now();
            const ts = now > lastTs ? now : lastTs + 1;
            lastTs = ts;
            const res = model.detectForVideo(video, ts);
            const lms = res.landmarks?.[0] || null;
            const st = tracker.update(lms, video.videoWidth / video.videoHeight);
            draw(canvasRef.current, video, lms, jointLandmarks(ex.id, st.side || 'L'), st.live.length > 0);
            if (voiceRef.current) {
              if (st.live.length && now - said.at > SAY_GAP) { say(st.live[0].cue); said.at = now; } else if (st.reps > said.rep && !st.live.length && now - said.at > 1200) {
                say(String(st.reps)); said.at = now;
              }
            }
            said.rep = st.reps;
            if (now - lastUi > 120) { setHud(st); lastUi = now; }
          }
          handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
        };
        // A picked video ends on its own; no frame callback follows the last frame, so listen for it.
        video.onended = () => { if (!stop) { stop = true; setSummary(tracker.reps()); setMode('done'); } };
        step();
      } catch (e) {
        if (stop) return;
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        setError(denied ? 'Camera permission was refused. Allow camera access for this site in your browser settings, then try again.' : (e?.message || 'Could not start the form check.'));
        setMode('intro');
      }
    })();

    return () => {
      stop = true;
      video.onended = null;
      if (handle != null) { video.cancelVideoFrameCallback?.(handle); cancelAnimationFrame(handle); }
      stream?.getTracks().forEach((t) => t.stop());
      video.pause(); video.removeAttribute('src'); video.srcObject = null;
      window.speechSynthesis?.cancel();
    };
  }, [source, ex.id]);

  // Revoke picked-file URLs once they are no longer shown.
  useEffect(() => () => { if (source?.kind === 'file') URL.revokeObjectURL(source.url); }, [source]);

  const finish = () => { setSummary(trackerRef.current?.reps() || []); setSource(null); setMode('done'); };
  const close = () => { setSource(null); onClose(); };
  const mirrored = source?.kind === 'camera' && source.facing === 'user';
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setSource({ kind: 'file', url: URL.createObjectURL(f) });
  };

  return (
    <div className="fc" role="dialog" aria-modal="true" aria-label={`Form check: ${ex.name}`}>
      <div className={`fc-stage ${mode === 'live' || mode === 'loading' ? '' : 'hidden'}`}>
        <video ref={videoRef} className={mirrored ? 'mirror' : ''} playsInline muted />
        <canvas ref={canvasRef} className={mirrored ? 'mirror' : ''} />
        {mode === 'loading' && <div className="fc-msg">Loading the pose model on your phone…</div>}
        {mode === 'live' && hud && (
          <>
            <div className="fc-top">
              <div className="fc-count"><b>{hud.reps}</b><span>reps · {hud.good} clean</span></div>
              {hud.joint?.deg != null && <div className="fc-angle">{hud.joint.label} {hud.joint.deg}°</div>}
            </div>
            {!hud.visible || hud.hint ? <div className="fc-msg">{hud.hint}</div> : null}
            {hud.live.length > 0 && (
              <div className="fc-fault" role="alert">
                <b>{hud.live[0].label}</b><span>{hud.live[0].cue}</span>
              </div>
            )}
            {!hud.live.length && hud.lastRep && (
              <div className={`fc-rep ${hud.lastRep.faults.length ? 'warn' : 'good'}`}>
                Rep {hud.lastRep.n}: {hud.lastRep.faults.length ? hud.lastRep.faults.map((f) => f.label).join(' · ') : 'clean ✓'}
              </div>
            )}
          </>
        )}
        <div className="fc-bar">
          <button type="button" className="btn sm" onClick={() => setVoice(!voice)} aria-pressed={voice}>{voice ? '🔊 Voice' : '🔇 Muted'}</button>
          {source?.kind === 'camera' && <button type="button" className="btn sm" onClick={() => setSource({ kind: 'camera', facing: source.facing === 'user' ? 'environment' : 'user' })}>🔄 Flip</button>}
          <button type="button" className="btn primary sm" onClick={finish}>Done</button>
        </div>
      </div>

      {mode === 'intro' && (
        <div className="fc-panel">
          <h2>Form check · {ex.name}</h2>
          <p className="fc-setup">📱 {info.setup} Prop your phone up and step back until your {info.camera === 'side' ? 'whole side' : 'whole body'} shows.</p>
          <p className="small"><b>Counts reps by your {info.jointLabel?.toLowerCase()} and watches for:</b></p>
          <ul className="mistakes">{info.faults.map((f) => <li key={f}>{f}</li>)}</ul>
          <p className="small muted">🔒 The pose model runs on this phone. Video is never uploaded or saved.</p>
          {error && <p className="fc-error" role="alert">{error}</p>}
          <button type="button" className="btn primary block" onClick={() => setSource({ kind: 'camera', facing: 'user' })}>📷 Start camera</button>
          <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>🎞️ Check a video from this phone</button>
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={pickFile} />
          <button type="button" className="btn ghost block" onClick={close}>Close</button>
        </div>
      )}

      {mode === 'done' && (
        <div className="fc-panel">
          <h2>{summary?.length || 0} reps · {summary?.filter((r) => !r.faults.length).length || 0} clean</h2>
          {summary?.length ? (
            <ol className="fc-reps">
              {summary.map((r) => (
                <li key={r.n} className={r.faults.length ? 'warn' : 'good'}>
                  {r.faults.length ? r.faults.map((k) => info.faultText[k]?.label || k).join(' · ') : 'Clean ✓'}
                </li>
              ))}
            </ol>
          ) : <p className="muted">No full reps seen. Check the camera shows your {info.camera === 'side' ? 'side' : 'front'} and try again.</p>}
          <button type="button" className="btn primary block" onClick={() => { setSummary(null); setMode('intro'); }}>Go again</button>
          <button type="button" className="btn ghost block" onClick={close}>Close</button>
        </div>
      )}
    </div>
  );
}
