import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {CSSProperties} from 'react';

const colors = {
  bgA: '#0b1021',
  bgB: '#101a32',
  bgC: '#13293d',
  line: 'rgba(125, 211, 252, 0.35)',
  text: '#f8fafc',
  accentA: '#67e8f9',
  accentB: '#bef264',
};

type SlideConfig = {
  message: string;
  image?: string;
  crop?: CSSProperties;
  accent: string;
};

const slides: SlideConfig[] = [
  {
    message: 'Zotero Agent Bridge for VS Code/Cursor',
    accent: colors.accentA,
  },
  {
    message: 'Search papers you already highlighted in Zotero.',
    image: staticFile('three-line-picker.png'),
    accent: colors.accentA,
  },
  {
    message: 'Export markdown, notes, highlights, and PDFs into your repository.',
    image: staticFile('three-line-picker.png'),
    crop: {objectPosition: '50% 40%'},
    accent: colors.accentB,
  },
  {
    message: 'Open those files in Cursor, Antigravity, or VS Code.',
    image: staticFile('workflow-pdf-highlights.png'),
    accent: colors.accentA,
  },
  {
    message: 'Ask Codex or Claude Code for a summary directly from local files.',
    image: staticFile('workflow-comparative-analysis.png'),
    accent: colors.accentB,
  },
  {
    message: 'No upload-to-chat loop. Source context stays in your own workspace.',
    image: staticFile('workflow-pdf-highlights.png'),
    crop: {objectPosition: '50% 28%'},
    accent: colors.accentA,
  },
  {
    message: 'Merge agent summaries with your own notes and evidence.',
    image: staticFile('workflow-comparative-analysis.png'),
    accent: colors.accentB,
  },
  {
    message: 'Edit everything as real files you can inspect and refine.',
    image: staticFile('workflow-comparative-analysis.png'),
    crop: {objectPosition: '52% 54%'},
    accent: colors.accentA,
  },
  {
    message: 'From reading to synthesis, the workflow stays inside your editor.',
    image: staticFile('workflow-pdf-highlights.png'),
    accent: colors.accentB,
  },
  {
    message: 'Read. Highlight. Export. Synthesize.',
    accent: colors.accentA,
  },
];

const TypeMessage = ({text, accent}: {text: string; accent: string}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const typeFrames = Math.floor(durationInFrames * 0.56);
  const chars = Math.floor(
    interpolate(frame, [0, typeFrames], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );

  const shown = text.slice(0, chars);
  const showCursor = Math.floor(frame / 8) % 2 === 0 && chars < text.length;

  const appear = spring({
    frame,
    fps: 30,
    config: {damping: 200, stiffness: 180},
  });

  return (
    <div
      style={{
        width: 1520,
        padding: '22px 28px',
        borderRadius: 22,
        border: `1px solid ${colors.line}`,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(12px)',
        transform: `translateY(${(1 - appear) * 36}px)`,
        opacity: appear,
      }}
    >
      <div
        style={{
          fontFamily: 'Avenir Next, Futura, Trebuchet MS, sans-serif',
          fontWeight: 700,
          fontSize: 56,
          lineHeight: 1.14,
          letterSpacing: 0.3,
          color: colors.text,
        }}
      >
        {shown}
        <span style={{color: accent, opacity: showCursor ? 1 : 0}}>|</span>
      </div>
    </div>
  );
};

const Slide = ({message, image, crop, accent, index}: SlideConfig & {index: number}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const bgDriftX = interpolate(frame, [0, durationInFrames], [-180, 180], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bgDriftY = interpolate(frame, [0, durationInFrames], [120, -90], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const enterOpacity = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const imageScale = interpolate(frame, [0, durationInFrames], [1.1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  const imageShift = interpolate(
    frame,
    [0, durationInFrames],
    [index % 2 === 0 ? -70 : 70, index % 2 === 0 ? 40 : -40],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    },
  );

  const stripeX = interpolate(frame, [0, durationInFrames], [-300, 2200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{opacity: enterOpacity}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${25 + index * 6}% ${20 + index * 4}%, ${colors.bgC}, ${colors.bgA} 68%)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: -200 + bgDriftY,
          left: -300 + bgDriftX,
          width: 720,
          height: 720,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.25), rgba(34,211,238,0))',
          filter: 'blur(28px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: -220 - bgDriftY,
          right: -260 - bgDriftX,
          width: 780,
          height: 780,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(190,242,100,0.2), rgba(190,242,100,0))',
          filter: 'blur(32px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 92,
          left: stripeX,
          width: 340,
          height: 8,
          borderRadius: 999,
          background: accent,
          opacity: 0.75,
        }}
      />

      {image ? (
        <div
          style={{
            position: 'absolute',
            left: 130,
            right: 130,
            top: 130,
            bottom: 280,
            borderRadius: 22,
            border: `1px solid ${colors.line}`,
            boxShadow: '0 26px 80px rgba(2, 6, 23, 0.55)',
            overflow: 'hidden',
          }}
        >
          <Img
            src={image}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `translateX(${imageShift}px) scale(${imageScale})`,
              ...crop,
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 78,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <TypeMessage text={message} accent={accent} />
      </div>
    </AbsoluteFill>
  );
};

export const ZoteroWorkflowVideo = () => {
  const framesPerSlide = 90;

  return (
    <AbsoluteFill>
      {slides.map((slide, index) => {
        return (
          <Sequence key={`${slide.message}-${index}`} from={index * framesPerSlide} durationInFrames={framesPerSlide} premountFor={15}>
            <Slide {...slide} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
