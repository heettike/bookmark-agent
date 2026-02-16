import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  AbsoluteFill,
  staticFile,
  Img,
} from "remotion";

const DARK = "#0a0a0a";
const GREEN = "#4ade80";
const PURPLE = "#a78bfa";
const RED = "#f87171";
const AMBER = "#fbbf24";
const BLUE = "#60a5fa";
const DIM = "rgba(255,255,255,0.5)";
const MONO = "'SF Mono', 'Fira Code', Consolas, monospace";

// ─── reusable components ───────────────────────────────────

const TypewriterText = ({
  text,
  delay = 0,
  speed = 2,
  color = "white",
  fontSize = 48,
}: {
  text: string;
  delay?: number;
  speed?: number;
  color?: string;
  fontSize?: number;
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);
  const charsToShow = Math.min(text.length, Math.floor(adjustedFrame / speed));
  const displayText = text.slice(0, charsToShow);
  const showCursor = adjustedFrame % 16 < 8 && charsToShow < text.length;

  return (
    <span style={{ fontFamily: MONO, fontSize, color, fontWeight: 500 }}>
      {displayText}
      {showCursor && <span style={{ color: GREEN, marginLeft: 2 }}>|</span>}
    </span>
  );
};

const SlideIn = ({
  children,
  delay = 0,
  from = "bottom",
  style = {},
}: {
  children: React.ReactNode;
  delay?: number;
  from?: "bottom" | "left" | "right";
  style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 180 },
  });

  const offset = interpolate(progress, [0, 1], [40, 0]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 1, 1]);

  const transform =
    from === "left"
      ? `translateX(${-offset}px)`
      : from === "right"
        ? `translateX(${offset}px)`
        : `translateY(${offset}px)`;

  return (
    <div style={{ transform, opacity, ...style }}>
      {children}
    </div>
  );
};

const PulsingDot = ({ color = GREEN, size = 10 }: { color?: string; size?: number }) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 ${size * 2}px ${color}60`,
        opacity: pulse,
      }}
    />
  );
};

const ClassLabel = ({
  label,
  color,
  delay,
  active = false,
}: {
  label: string;
  color: string;
  delay: number;
  active?: boolean;
}) => {
  return (
    <SlideIn delay={delay} from="left">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          border: `${active ? 2 : 1}px solid ${active ? color : `${color}40`}`,
          background: active ? `${color}20` : `${color}08`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            boxShadow: active ? `0 0 12px ${color}` : "none",
          }}
        />
        <span style={{ fontFamily: MONO, fontSize: 28, color, fontWeight: 600 }}>
          {label}
        </span>
      </div>
    </SlideIn>
  );
};

// ─── scenes ────────────────────────────────────────────────

// scene 1: problem (0-2s, frames 0-60)
const ProblemScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const counterProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 40,
  });

  const count = Math.floor(847 * counterProgress);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 160, fontWeight: 700, color: "white" }}>
        {count}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 28, color: DIM }}>
        bookmarks
      </div>
      <div style={{ marginTop: 40 }}>
        <TypewriterText
          text="you remember 3."
          delay={30}
          speed={3}
          color={RED}
          fontSize={36}
        />
      </div>
    </AbsoluteFill>
  );
};

// scene 2: capture (2-5s, frames 60-150)
const CaptureScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tweetOpacity = spring({
    frame,
    fps,
    config: { damping: 20 },
  });

  const dotDelay = 40;
  const dotScale = spring({
    frame: frame - dotDelay,
    fps,
    config: { damping: 12, stiffness: 300 },
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: tweetOpacity,
          width: 620,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "white",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Img src={staticFile("tweet-oliver.png")} style={{ width: "100%", display: "block" }} />

        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            transform: `scale(${dotScale})`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(10,10,10,0.9)",
            padding: "8px 16px",
            border: `1px solid ${GREEN}40`,
          }}
        >
          <PulsingDot color={GREEN} size={8} />
          <span style={{ fontFamily: MONO, fontSize: 14, color: GREEN }}>
            captured
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// scene 3: classify (5-9s, frames 150-270)
const ClassifyScene = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <SlideIn delay={0}>
        <div style={{ fontFamily: MONO, fontSize: 22, color: DIM, marginBottom: 20, letterSpacing: 2 }}>
          CLASSIFICATION
        </div>
      </SlideIn>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ClassLabel label="implement" color={BLUE} delay={15} active />
        <ClassLabel label="remember" color={PURPLE} delay={30} />
        <ClassLabel label="act" color={RED} delay={45} />
        <ClassLabel label="remind" color={AMBER} delay={60} />
      </div>

      <SlideIn delay={80}>
        <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 16, color: DIM, maxWidth: 500, textAlign: "center", lineHeight: 1.6 }}>
          step-by-step guide to deploying an AI agent that automates TikTok content creation on consumer hardware
        </div>
      </SlideIn>
    </AbsoluteFill>
  );
};

// scene 4: learn (9-13s, frames 270-390)
const LearnScene = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "0 200px",
      }}
    >
      <SlideIn delay={0}>
        <div style={{ fontFamily: MONO, fontSize: 18, color: DIM, letterSpacing: 2 }}>
          EXTRACTING KNOWLEDGE
        </div>
      </SlideIn>

      <SlideIn delay={20} style={{ width: "100%" }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            padding: 32,
            width: "100%",
            marginTop: 16,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 14, color: GREEN, marginBottom: 20 }}>
            key_insights:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SlideIn delay={40} from="left">
              <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)" }}>
                {"- \"OpenClaw agent runs on consumer hardware (old gaming PC)\""}
              </div>
            </SlideIn>
            <SlideIn delay={55} from="left">
              <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)" }}>
                {"- \"500k+ views in 5 days with automated posting strategy\""}
              </div>
            </SlideIn>
            <SlideIn delay={70} from="left">
              <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)" }}>
                {"- \"single post hit 234k views via content-discovery\""}
              </div>
            </SlideIn>
          </div>

          <div style={{ fontFamily: MONO, fontSize: 14, color: AMBER, marginTop: 24, marginBottom: 12 }}>
            action_items:
          </div>
          <SlideIn delay={90} from="left">
            <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)" }}>
              {"- \"set up OpenClaw agent on available hardware\""}
            </div>
          </SlideIn>
          <SlideIn delay={100} from="left">
            <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)", marginTop: 8 }}>
              {"- \"implement Larry's posting strategy and content framework\""}
            </div>
          </SlideIn>

          <div style={{ fontFamily: MONO, fontSize: 14, color: PURPLE, marginTop: 24, marginBottom: 12 }}>
            topics:
          </div>
          <SlideIn delay={110} from="left">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["ai-agents", "openclaw", "tiktok-growth", "automation", "content-creation"].map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    color: PURPLE,
                    padding: "4px 12px",
                    border: `1px solid ${PURPLE}40`,
                    background: `${PURPLE}10`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </SlideIn>
        </div>
      </SlideIn>
    </AbsoluteFill>
  );
};

// scene 5: search (13-16s, frames 390-480)
const SearchScene = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        padding: "0 100px",
      }}
    >
      {/* left: search + results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            width: "100%",
            border: "1px solid rgba(255,255,255,0.2)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 18, color: DIM }}>{"search:"}</span>
          <TypewriterText text="agent ships code overnight" delay={5} speed={3} color="white" fontSize={22} />
        </div>

        <SlideIn delay={50} style={{ width: "100%" }}>
          <div
            style={{
              width: "100%",
              border: `1px solid ${GREEN}30`,
              background: `${GREEN}05`,
              padding: 24,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <PulsingDot color={GREEN} size={6} />
              <span style={{ fontFamily: MONO, fontSize: 14, color: GREEN }}>0.96 match</span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: BLUE, marginLeft: 12 }}>implement</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.85)" }}>
              @ryancarson: autonomous agent loop that learns, compounds knowledge, and ships prioritized tasks nightly
            </div>
          </div>
        </SlideIn>

        <SlideIn delay={65} style={{ width: "100%" }}>
          <div
            style={{
              width: "100%",
              border: `1px solid rgba(255,255,255,0.08)`,
              background: `rgba(255,255,255,0.02)`,
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <PulsingDot color={DIM} size={6} />
              <span style={{ fontFamily: MONO, fontSize: 14, color: DIM }}>0.82 match</span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: BLUE, marginLeft: 12 }}>implement</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 17, color: "rgba(255,255,255,0.6)" }}>
              @oliverhenry: OpenClaw agent got 500k+ TikTok views in 5 days with automated content creation
            </div>
          </div>
        </SlideIn>
      </div>

      {/* right: tweet screenshot preview */}
      <SlideIn delay={55} from="right">
        <div
          style={{
            width: 340,
            border: "1px solid rgba(255,255,255,0.15)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Img src={staticFile("tweet-ryan.png")} style={{ width: "100%", display: "block" }} />
        </div>
      </SlideIn>
    </AbsoluteFill>
  );
};

// scene 6: notify (16-18s, frames 480-540)
const NotifyScene = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SlideIn delay={0} from="right">
        <div
          style={{
            width: 520,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            padding: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#0088cc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>t</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 14, color: DIM }}>telegram</span>
          </div>

          <div style={{ fontFamily: MONO, fontSize: 15, color: "rgba(255,255,255,0.9)", lineHeight: 1.7 }}>
            <div style={{ color: BLUE, marginBottom: 8 }}>implement from @oliverhenry:</div>
            <div>step-by-step guide to deploying an OpenClaw AI agent that achieved 500k+ TikTok views in 5 days on consumer hardware.</div>
            <div style={{ color: GREEN, marginTop: 12 }}>key insight: agent runs on old gaming PC, automates content creation + posting</div>
            <div style={{ color: AMBER, marginTop: 8 }}>next step: set up OpenClaw agent on available hardware</div>
          </div>
        </div>
      </SlideIn>
    </AbsoluteFill>
  );
};

// scene 7: CTA (18-20s, frames 540-600)
const CTAScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const urlOpacity = spring({
    frame: frame - 20,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          transform: `scale(${scale})`,
        }}
      >
        <PulsingDot color={GREEN} size={14} />
        <span style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: "white" }}>
          bookmark agent
        </span>
      </div>

      <div style={{ opacity: urlOpacity, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 24, color: DIM }}>
          github.com/heettike/bookmark-agent
        </span>
        <span style={{ fontFamily: MONO, fontSize: 16, color: GREEN }}>
          bookmark-agent.pages.dev
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── main composition ──────────────────────────────────────

export const BookmarkDemo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: DARK,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      {/* subtle scanline effect */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255,255,255,0.01) 2px,
            rgba(255,255,255,0.01) 4px
          )`,
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      <Sequence from={0} durationInFrames={60}>
        <ProblemScene />
      </Sequence>

      <Sequence from={60} durationInFrames={90}>
        <CaptureScene />
      </Sequence>

      <Sequence from={150} durationInFrames={120}>
        <ClassifyScene />
      </Sequence>

      <Sequence from={270} durationInFrames={120}>
        <LearnScene />
      </Sequence>

      <Sequence from={390} durationInFrames={90}>
        <SearchScene />
      </Sequence>

      <Sequence from={480} durationInFrames={60}>
        <NotifyScene />
      </Sequence>

      <Sequence from={540} durationInFrames={60}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
