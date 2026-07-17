import { useEffect, useRef } from 'react';
import { useAudioEngine } from '@/components/AudioEngineProvider';

/**
 * Live audio in/out meters fed by the GP-200's USB audio interface,
 * groundwork for the loop station. Bar widths are driven directly from a
 * rAF loop (no React state per frame). MONITOR routes the input to the
 * speakers; the OUT meter follows that monitoring path. Reads the shared
 * audio engine so the meters and looper run off one AudioContext.
 */
export function AudioMeters() {
  const meter = useAudioEngine();
  const { active, getLevels } = meter;
  const inBar = useRef<HTMLSpanElement>(null);
  const outBar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const { input, output } = getLevels();
      if (inBar.current) inBar.current.style.width = `${(input * 100).toFixed(1)}%`;
      if (outBar.current) outBar.current.style.width = `${(output * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevels]);

  if (!meter.active) {
    return (
      <div className="audio-meters">
        <button
          type="button"
          className="deck-btn"
          disabled={meter.starting}
          onClick={() => void meter.enable()}
          title="Capture the GP-200's USB audio for live metering"
        >
          {meter.starting ? 'AUDIO…' : 'AUDIO IN'}
        </button>
        {meter.error && <span className="am-error" title={meter.error}>audio unavailable</span>}
      </div>
    );
  }

  let monButtonClass = 'deck-btn mon';
  let outRowClass = 'am-row';
  let outRowTitle: string | undefined;
  if (meter.monitoring) {
    monButtonClass += ' on';
  } else {
    outRowClass += ' muted';
    outRowTitle =
      "Output muted — press MONITOR to hear the GP-200 through this computer's speakers";
  }

  return (
    <div className="audio-meters" title={meter.deviceLabel ?? undefined}>
      <div className="am-row">
        <span className="am-lbl">IN</span>
        <span className="am-track"><span ref={inBar} className="am-fill" /></span>
      </div>
      <div className={outRowClass} title={outRowTitle}>
        <span className="am-lbl">OUT</span>
        <span className="am-track"><span ref={outBar} className="am-fill out" /></span>
      </div>
      <button
        type="button"
        className={monButtonClass}
        aria-pressed={meter.monitoring}
        onClick={() => meter.setMonitoring(!meter.monitoring)}
        title="Monitor the input through this computer's speakers"
      >
        MONITOR
      </button>
      <button type="button" className="deck-btn quiet" onClick={meter.disable} title="Stop audio capture">
        ✕
      </button>
    </div>
  );
}
